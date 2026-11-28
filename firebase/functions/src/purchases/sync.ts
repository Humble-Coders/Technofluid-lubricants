import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

import {ENTITIES} from "../entities/entityModel";
import {TRIGGER_RETRIES, type SyncOutcome} from "../entities/sync";
import {platformRedelivers} from "../ledger/getHlClient";
import {HlError, isNotConnected, plainHlMessage, type HlClient, type HlLeg, type HlSaleTaxLine} from "../ledger/hlClient";
import {accountCache, registerAccountName} from "../money/hlAccounts";
import {booksFor, companyAccount, companyCustomer, isMainCompany} from "../companies/companyStore";
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

async function fail(ref: admin.firestore.DocumentReference, f: Fields, e: unknown, prior: number, fromTrigger: boolean, extra: Record<string, unknown> = {}): Promise<SyncOutcome> {
  if (isNotConnected(e)) {
    logger.warn("Books not connected — left PENDING", {path: ref.path});
    return "skipped";
  }
  const permanent = e instanceof Permanent || (e instanceof HlError && !e.transient);
  logger.error("Posting a purchase to HL failed", {path: ref.path, step: f.status, permanent, error: e instanceof Error ? e.message : String(e)});
  await ref.set(
    {...extra, [f.status]: "FAILED", [f.error]: e instanceof Permanent ? e.message : plainHlMessage(e), [f.attempts]: FieldValue.increment(1), [f.last]: FieldValue.serverTimestamp()},
    {merge: true},
  );
  if (!permanent && fromTrigger && prior < TRIGGER_RETRIES && platformRedelivers()) throw e;
  return "failed";
}

const pct = (bp: number) => `${(bp / 100).toLocaleString("en-IN", {maximumFractionDigits: 2})}%`;

/**
 * One input-tax line per GST leg, summed over every rate; the rate shown only when the WHOLE bill
 * has one rate (as sales). A 0 % line next to an 18 % one → no rate, so HL never sees 9 % against
 * an amount that includes untaxed goods.
 */
async function inputTaxLines(totals: PurchaseTotals, account: ReturnType<typeof accountCache>): Promise<HlSaleTaxLine[]> {
  const one = totals.byRate.length === 1 ? totals.byRate[0].gstRateBp : null;
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
    // The bill's own company (the main-business company for its date; missing = main).
    const other = isMainCompany(p.companyId) ? null : String(p.companyId);
    const books = await booksFor(db, hl, p.companyId).catch((e) => {
      throw new Permanent(e instanceof Error ? e.message : String(e));
    });
    // Resolve everything before posting anything.
    const s = (await db.collection(ENTITIES).doc(String(p.supplier.entityId)).get()).data();
    if (!s || s.deleted === true) throw new Permanent(`${p.supplier.name} no longer exists.`);
    let supplier: {customerId: string; accountId: string};
    if (other) {
      supplier = await companyCustomer(db, books, other, String(p.supplier.entityId), s);
    } else {
      if (s.syncStatus !== "SYNCED" || !s.hlCustomerId || !s.hlAccountId) throw new Waiting(`${p.supplier.name} isn't in the books yet`);
      supplier = {customerId: String(s.hlCustomerId), accountId: String(s.hlAccountId)};
    }
    const payments = (p.payments ?? []) as {registerId: string; kind: "CASH" | "BANK"; name: string; amountPaise: number}[];
    const regs = await Promise.all(payments.map((x) => db.collection(REGISTERS).doc(x.registerId).get()));
    const regAccounts: string[] = [];
    for (let i = 0; i < regs.length; i++) {
      const d = regs[i].data();
      if (!d || d.deleted === true) throw new Permanent(`${payments[i].name} no longer exists.`);
      if (other) {
        regAccounts.push((await companyAccount(db, books, other, regs[i].id, "ASSET", registerAccountName(d.kind, String(d.name), regs[i].id))) as string);
        continue;
      }
      if (!d.hlAccountId) throw new Waiting(`${d.name} isn't in the books yet`);
      regAccounts.push(String(d.hlAccountId));
    }
    const account = accountCache(books);
    const totals = p.totals as PurchaseTotals;
    const inventory = (await account(PURCHASE_ACCOUNTS.inventory.name, PURCHASE_ACCOUNTS.inventory.type)).id;
    const taxLines = await inputTaxLines(totals, account);
    const description = `Purchase ${p.ref} · bill ${p.billNo}`;

    const progress = (await progressRef.get()).data() ?? {};
    let hlTxnId: string | undefined = progress.hlTxnId;
    let hlLegs: HlLeg[] | undefined = progress.hlLegs;
    let hlBillId: string | null = typeof progress.hlBillId === "string" ? progress.hlBillId : null;
    let hlBillNumber: string | null = typeof progress.hlBillNumber === "string" ? progress.hlBillNumber : null;
    if (!hlTxnId || !hlLegs) {
      // Kept in HL as a supplier bill too (bill-by-bill payables, carried into a new year one by
      // one). HL wants each party's bill numbers unique: a number already used there (a bill
      // re-entered after a cancel) goes in with our own reference added.
      const post = (billNumber: string) =>
        books.postCustomerPurchase({
          customerId: supplier.customerId,
          amountPaise: totals.subtotalPaise,
          taxLines,
          expenseAccountId: inventory,
          description,
          date: p.billDate,
          sourceId: purchaseSourceIds.bill(id),
          actorRef,
          billNumber,
          reference: String(p.ref),
        });
      hlBillNumber = String(p.billNo);
      let r;
      try {
        r = await post(hlBillNumber);
      } catch (e) {
        if (!(e instanceof HlError && e.code === "DUPLICATE_BILL_NUMBER")) throw e;
        hlBillNumber = `${p.billNo} · ${p.ref}`;
        r = await post(hlBillNumber);
      }
      hlBillId = r.billId;
      hlTxnId = r.txnId;
      hlLegs = [
        {accountId: inventory, type: "DEBIT", amountPaise: totals.subtotalPaise},
        ...taxLines.map((l): HlLeg => ({accountId: l.accountId, type: "DEBIT", amountPaise: l.amountPaise})),
        {accountId: supplier.accountId, type: "CREDIT", amountPaise: totals.subtotalPaise + taxLines.reduce((sum, l) => sum + l.amountPaise, 0)},
      ];
      await progressRef.set({hlTxnId, hlLegs, hlBillId, hlBillNumber, at: FieldValue.serverTimestamp()}, {merge: true});
    }

    const paymentTxns: string[] = Array.isArray(progress.paymentTxns) ? [...progress.paymentTxns] : [];
    for (let i = 0; i < payments.length; i++) {
      if (paymentTxns[i]) continue;
      const r = await books.postPayout({
        customerId: supplier.customerId,
        amountPaise: payments[i].amountPaise,
        method: payments[i].kind,
        paymentAccountId: regAccounts[i],
        date: p.billDate,
        sourceId: purchaseSourceIds.payout(id, i),
        actorRef,
        description: `Payment made with ${p.ref} (bill ${p.billNo})`,
        // Paid against the bill — unless it was cancelled in the books meanwhile.
        billId: p.status === "CANCELLED" && p.cancelSyncStatus === "SYNCED" ? null : hlBillId,
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
          hlBillId,
          hlBillNumber,
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
    // The bill itself may already be in the books (a payment failed after it): say so on the doc,
    // so the bill view and statements know, and a cancellation reverses it.
    const done = (await progressRef.get().catch(() => null))?.data();
    let billInBooks: Record<string, unknown> = {};
    if (done?.hlTxnId && Array.isArray(done.hlLegs)) {
      billInBooks = {hlTxnId: done.hlTxnId, hlLegs: done.hlLegs, hlBillId: done.hlBillId ?? null, hlBillNumber: done.hlBillNumber ?? null};
      // Cancelled before the bill went in (so the cancel didn't ask for a reversal) → ask now.
      const latest = (await ref.get().catch(() => null))?.data();
      if (latest?.status === "CANCELLED" && !latest.cancelSyncStatus) billInBooks = {...billInBooks, cancelSyncStatus: "PENDING", cancelSyncError: null, cancelSyncAttempts: 0};
    }
    return fail(ref, MAIN, e, prior, opts.fromTrigger === true, billInBooks);
  }
}

/** Reverses a cancelled purchase in the books: the bill's own stored legs, flipped (idempotent on sourceId). */
export async function cancelPurchaseInBooks(db: admin.firestore.Firestore, hl: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(PURCHASES).doc(id);
  const p = (await ref.get()).data();
  if (!p || p.deleted === true || p.status !== "CANCELLED") return "skipped";
  if (p.cancelSyncStatus !== "PENDING" && p.cancelSyncStatus !== "FAILED") return "skipped";
  // Keyed on the bill's OWN posting being in the books — not the whole sync (a payment may have
  // failed after the bill went in). Not posted at all yet → the bill's own posting sets this up after.
  const progress = (await db.collection(PURCHASE_SYNC).doc(id).get()).data() ?? {};
  const legs = (Array.isArray(p.hlLegs) && p.hlLegs.length >= 2 ? p.hlLegs : progress.hlTxnId && Array.isArray(progress.hlLegs) ? progress.hlLegs : null) as HlLeg[] | null;
  if (!legs) {
    if (p.syncStatus === "SYNCED") {
      return fail(ref, CANCEL, new Permanent("The bill's posting isn't recorded, so it can't be reversed."), Number(p.cancelSyncAttempts ?? 0), opts.fromTrigger === true);
    }
    return "skipped";
  }
  const prior = Number(p.cancelSyncAttempts ?? 0);
  try {
    const flipped = legs.map((l) => ({...l, type: l.type === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const)}));
    const day = String(p.cancel?.day ?? p.billDate);
    const books = await booksFor(db, hl, p.companyId);
    const billId = typeof p.hlBillId === "string" ? p.hlBillId : typeof progress.hlBillId === "string" ? progress.hlBillId : null;
    if (billId) {
      // Kept as a supplier bill: HL's own cancel reverses the purchase and marks the bill
      // CANCELLED (idempotent). Money already paid on it stays with the supplier as credit.
      const c = await books.cancelSupplierBill(billId, {reason: `${String(p.cancel?.reason ?? "Cancelled")} (${p.ref})`, date: day < p.billDate ? p.billDate : day});
      await ref.set({cancelSyncStatus: "SYNCED", cancelHlTxnId: c.txnId, cancelSyncError: null, cancelSyncAttempts: 0, lastCancelAttemptAt: FieldValue.serverTimestamp()}, {merge: true});
      return "synced";
    }
    const r = await books.postTransaction({
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
