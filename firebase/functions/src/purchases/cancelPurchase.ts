import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {ITEMS, MOVEMENTS, indiaToday, requestId as parseRequestId} from "../stock/stockModel";
import {PURCHASES, PURCHASE_REQUESTS, bad} from "./purchaseModel";

/**
 * Cancel a purchase (Admin or Accounts), with a reason — a bill is never edited. In ONE
 * transaction the stock goes back out ("Purchase cancelled" lines, dated today; none if
 * the goods were already counted when the bill was entered) and the purchase is marked
 * CANCELLED. The books follow: onPurchaseWritten posts the reversal of the bill's own
 * legs. Payments already made stay (the supplier then owes us — a refund is money
 * received). A bill not yet in the books is first posted, then reversed, so a payment
 * made with it is never lost from the books. Retry-safe on requestId.
 */
export const cancelPurchase = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const reqId = parseRequestId(data.requestId);
  const purchaseId = typeof data.purchaseId === "string" ? data.purchaseId.trim() : "";
  if (!purchaseId) bad("Which purchase?");
  const reason = typeof data.reason === "string" ? data.reason.replace(/\s+/g, " ").trim() : "";
  if (!reason) bad("Give a reason for cancelling.");
  if (reason.length > 300) bad("Keep the reason under 300 characters.");
  const db = admin.firestore();
  const ref = db.collection(PURCHASES).doc(purchaseId);
  const reqRef = db.collection(PURCHASE_REQUESTS).doc(reqId);
  const day = indiaToday();

  return db.runTransaction(async (tx) => {
    const prev = await tx.get(reqRef);
    if (prev.exists) return {...(prev.data()?.result as Record<string, unknown>), alreadyDone: true};
    const p = (await tx.get(ref)).data();
    if (!p || p.deleted === true) throw new HttpsError("not-found", "That purchase doesn't exist.");
    if (p.status === "CANCELLED") throw new HttpsError("failed-precondition", `${p.ref} is already cancelled.`);
    const movements = (await Promise.all(((p.stockMovementIds ?? []) as string[]).map((id) => tx.get(db.collection(MOVEMENTS).doc(id))))).map((m) => m.data());
    const itemIds = [...new Set(movements.map((m) => String(m?.itemId ?? "")).filter(Boolean))];
    const itemSnaps = await Promise.all(itemIds.map((id) => tx.get(db.collection(ITEMS).doc(id))));
    const onHand = new Map(itemSnaps.map((s, i) => [itemIds[i], typeof s.data()?.onHandMilli === "number" ? (s.data()!.onHandMilli as number) : 0]));

    // ── Writes. ──
    const now = FieldValue.serverTimestamp();
    const by = {uid: caller.uid, name: caller.name};
    const belowZero: {itemId: string; name: string; onHandMilli: number}[] = [];
    movements.forEach((m, i) => {
      if (!m) return;
      const qty = Math.abs(Number(m.qtyMilli));
      const after = (onHand.get(m.itemId) ?? 0) - qty;
      onHand.set(m.itemId, after);
      tx.create(db.collection(MOVEMENTS).doc(`purchasecancel_${purchaseId}-${i}`), {
        itemId: m.itemId, itemName: m.itemName, itemKind: m.itemKind, baseUnit: m.baseUnit, type: "PURCHASE_CANCEL",
        qtyMilli: -qty, onHandAfterMilli: after, note: `Purchase cancelled · ${p.ref}`,
        journalDate: day, requestId: `purchasecancel_${purchaseId}`, reversesId: null, reversedById: null,
        byUid: caller.uid, byName: caller.name, purchaseId, purchaseRef: p.ref, createdAt: now,
      });
    });
    for (const id of itemIds) {
      tx.update(db.collection(ITEMS).doc(id), {onHandMilli: onHand.get(id), lastMovementAt: now, updatedAt: now});
      const after = onHand.get(id) ?? 0;
      if (after < 0) belowZero.push({itemId: id, name: String(movements.find((m) => m?.itemId === id)?.itemName ?? id), onHandMilli: after});
    }
    tx.update(ref, {
      status: "CANCELLED",
      cancel: {reason, by, day, at: now},
      // In the books already → reverse it there; not yet → the bill's own posting does it after.
      cancelSyncStatus: p.syncStatus === "SYNCED" ? "PENDING" : null,
      cancelSyncError: null,
      cancelSyncAttempts: 0,
      updatedAt: now,
    });
    const result = {purchaseId, ref: p.ref, belowZero};
    tx.create(reqRef, {fn: "cancelPurchase", result, at: now});
    return {...result, alreadyDone: false};
  });
});

/** "Retry" on a purchase (or its cancellation) that couldn't be saved to the books. */
export const retryPurchaseSync = onCall({region: "us-central1"}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const purchaseId = typeof request.data?.purchaseId === "string" ? request.data.purchaseId.trim() : "";
  if (!purchaseId) bad("Which purchase?");
  const db = admin.firestore();
  const ref = db.collection(PURCHASES).doc(purchaseId);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That purchase doesn't exist.");
    const now = FieldValue.serverTimestamp();
    if (d.syncStatus === "FAILED") {
      tx.update(ref, {syncStatus: "PENDING", syncAttempts: 0, hlSyncError: null, updatedAt: now});
      return {purchaseId, retrying: "bill"};
    }
    if (d.cancelSyncStatus === "FAILED") {
      tx.update(ref, {cancelSyncStatus: "PENDING", cancelSyncAttempts: 0, cancelSyncError: null, updatedAt: now});
      return {purchaseId, retrying: "cancel"};
    }
    return {purchaseId, retrying: null};
  });
});
