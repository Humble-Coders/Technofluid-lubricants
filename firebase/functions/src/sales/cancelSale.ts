import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {ITEMS, MOVEMENTS, requestId as parseRequestId} from "../stock/stockModel";
import {SALES, SALE_REQUESTS, bad} from "./saleModel";

/**
 * Cancel an invoice (Admin or Accounts), with a reason. GST doesn't allow editing an
 * issued invoice: a mistake is a cancellation and a new sale. In ONE transaction the
 * stock comes back ("Sale cancelled" lines, today) and the sale is marked CANCELLED — its
 * number stays used. The books follow: onSaleWritten cancels the invoice in HL (which
 * posts the mirror of the sale; anything already paid stays as the customer's credit).
 * A sale not yet in the books is first posted, then cancelled, so money taken at billing
 * is never lost from the books. Retry-safe on requestId.
 */

const today = () => new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(new Date());

export const cancelSale = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const reqId = parseRequestId(data.requestId);
  const saleId = typeof data.saleId === "string" ? data.saleId.trim() : "";
  if (!saleId) bad("Which sale?");
  const reason = typeof data.reason === "string" ? data.reason.replace(/\s+/g, " ").trim() : "";
  if (!reason) bad("Give a reason for cancelling.");
  if (reason.length > 300) bad("Keep the reason under 300 characters.");
  const db = admin.firestore();
  const saleRef = db.collection(SALES).doc(saleId);
  const reqRef = db.collection(SALE_REQUESTS).doc(reqId);
  const day = today();

  return db.runTransaction(async (tx) => {
    const prev = await tx.get(reqRef);
    if (prev.exists) return {...(prev.data()?.result as Record<string, unknown>), alreadyDone: true};
    const sale = (await tx.get(saleRef)).data();
    if (!sale || sale.deleted === true) throw new HttpsError("not-found", "That sale doesn't exist.");
    if (sale.status === "CANCELLED") throw new HttpsError("failed-precondition", `${sale.invoiceNo} is already cancelled.`);
    const movements = (await Promise.all((sale.stockMovementIds as string[]).map((id) => tx.get(db.collection(MOVEMENTS).doc(id))))).map((s) => s.data());
    const itemIds = [...new Set(movements.map((m) => String(m?.itemId ?? "")).filter(Boolean))];
    const itemSnaps = await Promise.all(itemIds.map((id) => tx.get(db.collection(ITEMS).doc(id))));
    const onHand = new Map(itemSnaps.map((s, i) => [itemIds[i], typeof s.data()?.onHandMilli === "number" ? (s.data()!.onHandMilli as number) : 0]));

    // ── Writes. ──
    const now = FieldValue.serverTimestamp();
    const by = {uid: caller.uid, name: caller.name};
    movements.forEach((m, i) => {
      if (!m) return;
      const after = (onHand.get(m.itemId) ?? 0) + Math.abs(Number(m.qtyMilli));
      onHand.set(m.itemId, after);
      tx.create(db.collection(MOVEMENTS).doc(`salecancel_${saleId}-${i}`), {
        itemId: m.itemId, itemName: m.itemName, itemKind: m.itemKind, baseUnit: m.baseUnit, type: "SALE_CANCEL",
        qtyMilli: Math.abs(Number(m.qtyMilli)), onHandAfterMilli: after, note: `Sale cancelled · ${sale.invoiceNo}`,
        journalDate: day, requestId: `salecancel_${saleId}`, reversesId: null, reversedById: null,
        byUid: caller.uid, byName: caller.name, saleId, invoiceNo: sale.invoiceNo, createdAt: now,
      });
    });
    for (const id of itemIds) tx.update(db.collection(ITEMS).doc(id), {onHandMilli: onHand.get(id), lastMovementAt: now, updatedAt: now});
    tx.update(saleRef, {
      status: "CANCELLED",
      cancel: {reason, by, day, at: now},
      // In the books already → cancel it there; not yet → the sale's own posting does it after.
      cancelSyncStatus: sale.syncStatus === "SYNCED" ? "PENDING" : null,
      cancelSyncError: null,
      cancelSyncAttempts: 0,
      updatedAt: now,
    });
    const result = {saleId, invoiceNo: sale.invoiceNo};
    tx.create(reqRef, {fn: "cancelSale", result, at: now});
    return {...result, alreadyDone: false};
  });
});

/** "Retry" on a sale (or its cancellation) that couldn't be saved to the books. */
export const retrySaleSync = onCall({region: "us-central1"}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const saleId = typeof request.data?.saleId === "string" ? request.data.saleId.trim() : "";
  if (!saleId) bad("Which sale?");
  const db = admin.firestore();
  const ref = db.collection(SALES).doc(saleId);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That sale doesn't exist.");
    const now = FieldValue.serverTimestamp();
    if (d.syncStatus === "FAILED") {
      tx.update(ref, {syncStatus: "PENDING", syncAttempts: 0, hlSyncError: null, updatedAt: now});
      return {saleId, retrying: "sale"};
    }
    if (d.cancelSyncStatus === "FAILED") {
      tx.update(ref, {cancelSyncStatus: "PENDING", cancelSyncAttempts: 0, cancelSyncError: null, updatedAt: now});
      return {saleId, retrying: "cancel"};
    }
    return {saleId, retrying: null};
  });
});
