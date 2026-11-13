import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

import {ENTITIES} from "../entities/entityModel";
import {TRIGGER_RETRIES, type SyncOutcome} from "../entities/sync";
import {platformRedelivers} from "../ledger/getHlClient";
import {HlError, isNotConnected, plainHlMessage, type HlClient, type HlLeg, type HlSaleTaxLine} from "../ledger/hlClient";
import {accountCache} from "../money/hlAccounts";
import {REGISTERS, SYSTEM_ACCOUNTS} from "../money/moneyModel";
import {PURCHASES, PURCHASE_ACCOUNTS, PURCHASE_SYNC, purchaseSourceIds, type PurchaseTotals} from "./purchaseModel";

/**
 * Posting purchases to Humble Ledger — the same spine as sales: transient failure →
 * FAILED + redelivered (capped by the doc's own attempts), permanent → FAILED, books not
 * connected → nothing written (stays PENDING), a supplier / cash-bank account not in
 * the books yet → left PENDING untouched (the reconcile, or postWaitingFor, picks it up).
 *
 *  1. POST /customer-purchases against the supplier's own HL customer (netting — no HL
 *     vendors): DR "Inventory · Purchased stock" with the subtotal (goods + freight +
 *     round-off), DR Input CGST / SGST / IGST, CR the supplier with the bill total.
 *     The legs are stored (hlLegs) so a cancellation reverses exactly them.
 *  2. One /customer-payouts per payment made with the bill.
 *  Progress is kept in purchaseSync/{id} (server-only, no trigger) so a retry never
 *  re-posts a step, and the purchase doc is written once at the end.
 *
 * A cancelled purchase: cancelPurchaseInBooks posts a REVERSAL of the stored legs
 * (idempotent on its sourceId). Payouts already made stay.
 */

class Permanent extends Error {}
class Waiting extends Error {}

type Fields = {status: string; error: string; attempts: string; last: string};
const MAIN: Fields = {status: "syncStatus", error: "hlSyncError", attempts: "syncAttempts", last: "lastSyncAttemptAt"};
const CANCEL: Fields = {status: "cancelSyncStatus", error: "cancelSyncError", attempts: "cancelSyncAttempts", last: "lastCancelAttemptAt"};

async function fail(ref: admin.firestore.DocumentReference, f: Fields, e: unknown, prior: number, fromTrigger: boolean): Promise<SyncOutcome> {
  if (isNotConnected(e)) {
    logger.warn("Books not connected — left PENDING", {path: ref.path});
    return "skipped";
  }
  const permanent = e instanceof Permanent || (e instanceof HlError && !e.transient);
  logger.error("Posting a purchase to HL failed", {path: ref.path, step: f.status, permanent, error: e instanceof Error ? e.message : String(e)});
  await ref.set(
    {[f.status]: "FAILED", [f.error]: e instanceof Permanent ? e.message : plainHlMessage(e), [f.attempts]: FieldValue.increment(1), [f.last]: FieldValue.serverTimestamp()},
    {merge: true},
  );
  if (!permanent && fromTrigger && prior < TRIGGER_RETRIES && platformRedelivers()) throw e;
  return "failed";
}

const pct = (bp: number) => `${(bp / 100).toLocaleString("en-IN", {maximumFractionDigits: 2})}%`;

/** One input-tax line per GST leg, summed over every rate; the rate shown only when the bill has one rate. */
async function inputTaxLines(totals: PurchaseTotals, account: ReturnType<typeof accountCache>): Promise<HlSaleTaxLine[]> {
  const taxed = totals.byRate.filter((r) => r.cgstPaise + r.sgstPaise + r.igstPaise > 0);
  const one = taxed.length === 1 ? taxed[0].gstRateBp : null;
  const legs = [
    {label: "Input CGST", amount: totals.cgstPaise, rateBp: one === null ? 0 : one / 2, acct: SYSTEM_ACCOUNTS.inputCgst},
    {label: "Input SGST", amount: totals.sgstPaise, rateBp: one === null ? 0 : one / 2, acct: SYSTEM_ACCOUNTS.inputSgst},
    {label: "Input IGST", amount: totals.igstPaise, rateBp: one ?? 0, acct: SYSTEM_ACCOUNTS.inputIgst},
  ];
  const out: HlSaleTaxLine[] = [];
  for (const l of legs) {
    if (l.amount <= 0) continue;
    out.push({label: l.rateBp ? `${l.label} ${pct(l.rateBp)}` : l.label, rateBp: l.rateBp, accountId: (await account(l.acct.name, l.acct.type, true)).id, amountPaise: l.amount});
  }
  return out;
}

export async function syncPurchase(db: admin.firestore.Firestore, hl: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(PURCHASES).doc(id);
  const p = (await ref.get()).data();
  if (!p || p.deleted === true || p.syncStatus === "SYNCED") return "skipped";
  const prior = Number(p.syncAttempts ?? 0);
  const progressRef = db.collection(PURCHASE_SYNC).doc(id);
  const actorRef = String(p.createdBy?.uid ?? "system");

  try {
    // Resolve everything before posting anything.
    const s = (await db.collection(ENTITIES).doc(String(p.supplier.entityId)).get()).data();
    if (!s || s.deleted === true) throw new Permanent(`${p.supplier.name} no longer exists.`);
    if (s.syncStatus !== "SYNCED" || !s.hlCustomerId || !s.hlAccountId) throw new Waiting(`${p.supplier.name} isn't in the books yet`);
    const payments = (p.payments ?? []) as {registerId: string; kind: "CASH" | "BANK"; name: string; amountPaise: number}[];
    const regs = await Promise.all(payments.map((x) => db.collection(REGISTERS).doc(x.registerId).get()));
    const regAccounts = regs.map((r, i) => {
      const d = r.data();
      if (!d || d.deleted === true) throw new Permanent(`${payments[i].name} no longer exists.`);
      if (!d.hlAccountId) throw new Waiting(`${d.name} isn't in the books yet`);
      return String(d.hlAccountId);
    });
    const account = accountCache(hl);
    const totals = p.totals as PurchaseTotals;
    const inventory = (await account(PURCHASE_ACCOUNTS.inventory.name, PURCHASE_ACCOUNTS.inventory.type)).id;
    const taxLines = await inputTaxLines(totals, account);
    const description = `Purchase ${p.ref} · bill ${p.billNo}`;

    const progress = (await progressRef.get()).data() ?? {};
    let hlTxnId: string | undefined = progress.hlTxnId;
    let hlLegs: HlLeg[] | undefined = progress.hlLegs;
    if (!hlTxnId || !hlLegs) {
      const r = await hl.postCustomerPurchase({
        customerId: String(s.hlCustomerId),
        amountPaise: totals.subtotalPaise,
        taxLines,
        expenseAccountId: inventory,
        description,
        date: p.billDate,
        sourceId: purchaseSourceIds.bill(id),
        actorRef,
      });
      hlTxnId = r.txnId;
      hlLegs = [
        {accountId: inventory, type: "DEBIT", amountPaise: totals.subtotalPaise},
        ...taxLines.map((l): HlLeg => ({accountId: l.accountId, type: "DEBIT", amountPaise: l.amountPaise})),
        {accountId: String(s.hlAccountId), type: "CREDIT", amountPaise: totals.subtotalPaise + taxLines.reduce((sum, l) => sum + l.amountPaise, 0)},
      ];
      await progressRef.set({hlTxnId, hlLegs, at: FieldValue.serverTimestamp()}, {merge: true});
    }

    const paymentTxns: string[] = Array.isArray(progress.paymentTxns) ? [...progress.paymentTxns] : [];
    for (let i = 0; i < payments.length; i++) {
      if (paymentTxns[i]) continue;
      const r = await hl.postPayout({
        customerId: String(s.hlCustomerId),
        amountPaise: payments[i].amountPaise,
        method: payments[i].kind,
        paymentAccountId: regAccounts[i],
        date: p.billDate,
        sourceId: purchaseSourceIds.payout(id, i),
        actorRef,
        description: `Payment made with ${p.ref} (bill ${p.billNo})`,
      });
      paymentTxns[i] = r.txnId;
      await progressRef.set({paymentTxns}, {merge: true});
    }

    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (!latest) return;
      tx.set(
        ref,
        {
          syncStatus: "SYNCED",
          hlTxnId,
          hlLegs,
          payments: payments.map((x, i) => ({...x, hlTxnId: paymentTxns[i] ?? null})),
          // HL's ledger rows carry only a txn id — these let a statement row find its purchase.
          paymentTxnIds: paymentTxns.filter(Boolean),
          hlSyncError: null,
          syncAttempts: 0,
          lastSyncAttemptAt: FieldValue.serverTimestamp(),
          // Cancelled while it was being posted (or before) → now reverse it in the books too.
          ...(latest.status === "CANCELLED" && latest.cancelSyncStatus !== "SYNCED" ? {cancelSyncStatus: "PENDING", cancelSyncError: null, cancelSyncAttempts: 0} : {}),
        },
        {merge: true},
      );
    });
    return "synced";
  } catch (e) {
    if (e instanceof Waiting) {
      logger.info("Purchase waiting for a dependency", {purchaseId: id, why: e.message});
      return "skipped"; // left PENDING, untouched
    }
    return fail(ref, MAIN, e, prior, opts.fromTrigger === true);
  }
}

/** Reverses a cancelled purchase in the books: the bill's own stored legs, flipped (idempotent on sourceId). */
export async function cancelPurchaseInBooks(db: admin.firestore.Firestore, hl: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(PURCHASES).doc(id);
  const p = (await ref.get()).data();
  if (!p || p.deleted === true || p.status !== "CANCELLED") return "skipped";
  if (p.cancelSyncStatus !== "PENDING" && p.cancelSyncStatus !== "FAILED") return "skipped";
  if (p.syncStatus !== "SYNCED") return "skipped"; // the bill's own posting sets this up afterwards
  const prior = Number(p.cancelSyncAttempts ?? 0);
  try {
    if (!Array.isArray(p.hlLegs) || p.hlLegs.length < 2) throw new Permanent("The bill's posting isn't recorded, so it can't be reversed.");
    const flipped = (p.hlLegs as HlLeg[]).map((l) => ({...l, type: l.type === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const)}));
    const day = String(p.cancel?.day ?? p.billDate);
    const r = await hl.postTransaction({
      postingType: "REVERSAL",
      description: `Cancelled ${p.ref} (bill ${p.billNo}): ${String(p.cancel?.reason ?? "Cancelled")}`.slice(0, 250),
      date: day < p.billDate ? p.billDate : day,
      sourceId: purchaseSourceIds.cancel(id),
      actorRef: String(p.cancel?.by?.uid ?? "system"),
      legs: flipped,
    });
    await ref.set({cancelSyncStatus: "SYNCED", cancelHlTxnId: r.txnId, cancelSyncError: null, cancelSyncAttempts: 0, lastCancelAttemptAt: FieldValue.serverTimestamp()}, {merge: true});
    return "synced";
  } catch (e) {
    return fail(ref, CANCEL, e, prior, opts.fromTrigger === true);
  }
}
