import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

import {ENTITIES} from "../entities/entityModel";
import {TRIGGER_RETRIES, type SyncOutcome} from "../entities/sync";
import {platformRedelivers} from "../ledger/getHlClient";
import {HlError, isNotConnected, plainHlMessage, type HlClient, type HlSaleTaxLine} from "../ledger/hlClient";
import {accountCache} from "../money/hlAccounts";
import {REGISTERS} from "../money/moneyModel";
import {SALES, SALE_ACCOUNTS, SALE_SYNC, saleSourceIds, type RateRow, type SaleTotals} from "./saleModel";

/**
 * Posting sales to Humble Ledger. Same spine as money: transient failure → FAILED +
 * redelivered (capped by the doc's own attempts), permanent → FAILED, books not
 * connected → nothing written (stays PENDING), a customer / cash-bank account not in the
 * books yet → left PENDING untouched (the reconcile, or postWaitingFor, picks it up).
 *
 *  1. POST /sales — our invoice number, revenue = taxable + round-off (so HL's invoice
 *     total is our grand total), one tax line per GST leg (Output CGST / SGST / IGST).
 *  2. One /payments per payment taken at billing, applied to that invoice.
 *  Progress is kept in saleSync/{saleId} (server-only, no trigger) so a retry never
 *  re-posts a step, and the sale doc is written once at the end.
 *
 * A cancelled sale: cancelSaleInBooks reads the HL invoice first (cancel is NOT
 * idempotent in HL) and cancels it once.
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
  logger.error("Posting a sale to HL failed", {path: ref.path, step: f.status, permanent, error: e instanceof Error ? e.message : String(e)});
  await ref.set(
    {[f.status]: "FAILED", [f.error]: e instanceof Permanent ? e.message : plainHlMessage(e), [f.attempts]: FieldValue.increment(1), [f.last]: FieldValue.serverTimestamp()},
    {merge: true},
  );
  if (!permanent && fromTrigger && prior < TRIGGER_RETRIES && platformRedelivers()) throw e;
  return "failed";
}

const pct = (bp: number) => `${(bp / 100).toLocaleString("en-IN", {maximumFractionDigits: 2})}%`;

/**
 * One HL tax line per GST leg — CGST, SGST, IGST — summed over every rate (HL takes at
 * most 4 lines). The rate is shown only when the whole invoice has one rate.
 */
async function taxLinesFor(totals: SaleTotals, account: ReturnType<typeof accountCache>): Promise<HlSaleTaxLine[]> {
  const rows: RateRow[] = totals.byRate;
  const one = rows.length === 1 ? rows[0].gstRateBp : null;
  const legs = [
    {label: "CGST", amount: totals.cgstPaise, rateBp: one === null ? 0 : one / 2, acct: SALE_ACCOUNTS.outputCgst.name},
    {label: "SGST", amount: totals.sgstPaise, rateBp: one === null ? 0 : one / 2, acct: SALE_ACCOUNTS.outputSgst.name},
    {label: "IGST", amount: totals.igstPaise, rateBp: one ?? 0, acct: SALE_ACCOUNTS.outputIgst.name},
  ];
  const out: HlSaleTaxLine[] = [];
  for (const l of legs) {
    if (l.amount <= 0) continue;
    out.push({label: l.rateBp ? `${l.label} ${pct(l.rateBp)}` : l.label, rateBp: l.rateBp, accountId: (await account(l.acct, "LIABILITY", true)).id, amountPaise: l.amount});
  }
  return out;
}

export async function syncSale(db: admin.firestore.Firestore, hl: HlClient, saleId: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(SALES).doc(saleId);
  const s = (await ref.get()).data();
  if (!s || s.deleted === true || s.syncStatus === "SYNCED") return "skipped";
  const prior = Number(s.syncAttempts ?? 0);
  const progressRef = db.collection(SALE_SYNC).doc(saleId);
  const actorRef = String(s.createdBy?.uid ?? "system");

  try {
    // Resolve everything before posting anything.
    const c = (await db.collection(ENTITIES).doc(String(s.customer.entityId)).get()).data();
    if (!c || c.deleted === true) throw new Permanent(`${s.customer.name} no longer exists.`);
    if (c.syncStatus !== "SYNCED" || !c.hlCustomerId) throw new Waiting(`${s.customer.name} isn't in the books yet`);
    const payments = (s.payments ?? []) as {registerId: string; kind: "CASH" | "BANK"; name: string; amountPaise: number}[];
    const regs = await Promise.all(payments.map((p) => db.collection(REGISTERS).doc(p.registerId).get()));
    const regAccounts = regs.map((r, i) => {
      const d = r.data();
      if (!d || d.deleted === true) throw new Permanent(`${payments[i].name} no longer exists.`);
      if (!d.hlAccountId) throw new Waiting(`${d.name} isn't in the books yet`);
      return String(d.hlAccountId);
    });
    const account = accountCache(hl);
    const totals = s.totals as SaleTotals;
    const revenue = (await account(SALE_ACCOUNTS.revenue.name, "INCOME")).id;
    const taxLines = await taxLinesFor(totals, account);

    const progress = (await progressRef.get()).data() ?? {};
    let hlSaleTxnId: string | undefined = progress.hlSaleTxnId;
    let hlInvoiceId: string | undefined = progress.hlInvoiceId;
    if (!hlSaleTxnId || !hlInvoiceId) {
      const r = await hl.postSale({
        customerId: String(c.hlCustomerId),
        amountPaise: totals.taxablePaise + totals.roundOffPaise,
        taxLines,
        revenueAccountId: revenue,
        description: `Sale ${s.invoiceNo}`,
        date: s.invoiceDate,
        sourceId: saleSourceIds.sale(saleId),
        actorRef,
        invoiceNumber: s.invoiceNo,
      });
      hlSaleTxnId = r.txnId;
      hlInvoiceId = r.invoiceId;
      await progressRef.set({hlSaleTxnId, hlInvoiceId, at: FieldValue.serverTimestamp()}, {merge: true});
    }

    const paymentTxns: string[] = Array.isArray(progress.paymentTxns) ? [...progress.paymentTxns] : [];
    for (let i = 0; i < payments.length; i++) {
      if (paymentTxns[i]) continue;
      const r = await hl.postPayment({
        customerId: String(c.hlCustomerId),
        amountPaise: payments[i].amountPaise,
        method: payments[i].kind,
        paymentAccountId: regAccounts[i],
        date: s.invoiceDate,
        sourceId: saleSourceIds.payment(saleId, i),
        actorRef,
        description: `Payment received with ${s.invoiceNo}`,
        invoiceId: hlInvoiceId,
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
          hlInvoiceId,
          hlSaleTxnId,
          payments: payments.map((p, i) => ({...p, hlTxnId: paymentTxns[i] ?? null})),
          // HL's ledger rows carry only a txn id — these let a statement row find its sale.
          paymentTxnIds: paymentTxns.filter(Boolean),
          hlSyncError: null,
          syncAttempts: 0,
          lastSyncAttemptAt: FieldValue.serverTimestamp(),
          // Cancelled while it was being posted (or before) → now cancel it in the books too.
          ...(latest.status === "CANCELLED" && latest.cancelSyncStatus !== "SYNCED" ? {cancelSyncStatus: "PENDING", cancelSyncError: null, cancelSyncAttempts: 0} : {}),
        },
        {merge: true},
      );
    });
    return "synced";
  } catch (e) {
    if (e instanceof Waiting) {
      logger.info("Sale waiting for a dependency", {saleId, why: e.message});
      return "skipped"; // left PENDING, untouched
    }
    return fail(ref, MAIN, e, prior, opts.fromTrigger === true);
  }
}

/** Cancels a sale's invoice in the books — once (HL's cancel isn't idempotent). */
export async function cancelSaleInBooks(db: admin.firestore.Firestore, hl: HlClient, saleId: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(SALES).doc(saleId);
  const s = (await ref.get()).data();
  if (!s || s.deleted === true || s.status !== "CANCELLED") return "skipped";
  if (s.cancelSyncStatus !== "PENDING" && s.cancelSyncStatus !== "FAILED") return "skipped";
  if (s.syncStatus !== "SYNCED" || !s.hlInvoiceId) return "skipped"; // the sale's own posting sets this up afterwards
  const prior = Number(s.cancelSyncAttempts ?? 0);
  try {
    const inv = await hl.getInvoice(String(s.hlInvoiceId));
    if (inv.status !== "CANCELLED") {
      const day = String(s.cancel?.day ?? s.invoiceDate);
      await hl.cancelInvoice(String(s.hlInvoiceId), {reason: String(s.cancel?.reason ?? "Cancelled"), date: day < s.invoiceDate ? s.invoiceDate : day});
    }
    await ref.set({cancelSyncStatus: "SYNCED", cancelSyncError: null, cancelSyncAttempts: 0, lastCancelAttemptAt: FieldValue.serverTimestamp()}, {merge: true});
    return "synced";
  } catch (e) {
    return fail(ref, CANCEL, e, prior, opts.fromTrigger === true);
  }
}
