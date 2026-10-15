import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {ITEMS, MOVEMENTS, note, positiveMilli, nonNegativeMilli} from "./stockModel";

/**
 * Undo one stock line — or "edit" it, which is undo + a corrected line, in one
 * transaction (decision #23: the diary is never rewritten).
 *
 *  - A REVERSAL line adds the opposite quantity and points back at the
 *    original (`reversesId`); the original gets `reversedById`. A line can be
 *    reversed once. Reversals themselves can't be reversed — record a new line.
 *  - Edit (`replacementQtyMilli`): allowed for OPENING / IN / OUT lines. The new
 *    line keeps the original's type, item and business date, and points back
 *    with `replacesId`. Count corrections aren't edited — count again instead.
 *  - Stock may go below zero; the result says so.
 *  - Retry-safe: the reversal / replacement ids are derived from the original,
 *    so a repeated request finds them already there and changes nothing.
 */
export const reverseStockMovement = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const id = typeof request.data?.movementId === "string" ? request.data.movementId.trim() : "";
  if (!id) throw new HttpsError("invalid-argument", "movementId is required.");
  const why = note(request.data?.note, "Undo") as string;
  const replacement = request.data?.replacementQtyMilli;
  const editing = replacement !== undefined && replacement !== null;

  const db = admin.firestore();
  const originalRef = db.collection(MOVEMENTS).doc(id);
  const reversalRef = db.collection(MOVEMENTS).doc(`rev_${id}`);
  const replacementRef = db.collection(MOVEMENTS).doc(`edit_${id}`);

  return db.runTransaction(async (tx) => {
    const originalSnap = await tx.get(originalRef);
    const original = originalSnap.data();
    if (!originalSnap.exists || !original) {
      throw new HttpsError("not-found", "That stock line doesn't exist.");
    }
    if (original.reversedById) {
      if (original.reversedById === reversalRef.id) {
        return {alreadyDone: true, onHandMilli: null, belowZero: false};
      }
      throw new HttpsError("failed-precondition", "That line has already been undone.");
    }
    if (original.type === "REVERSAL") {
      throw new HttpsError("failed-precondition", "An undo can't be undone — record a new line instead.");
    }

    let newQty = 0;
    if (editing) {
      if (!["OPENING", "IN", "OUT"].includes(original.type)) {
        throw new HttpsError(
          "failed-precondition",
          "Only opening, in and out lines can be edited — for a count, count again.",
        );
      }
      const amount = original.type === "OPENING" ?
        nonNegativeMilli(replacement, "New quantity") :
        positiveMilli(replacement, "New quantity");
      newQty = original.type === "OUT" ? -amount : amount;
    }

    const itemRef = db.collection(ITEMS).doc(String(original.itemId));
    const itemSnap = await tx.get(itemRef);
    const item = itemSnap.data();
    if (!itemSnap.exists || !item) throw new HttpsError("not-found", "The stock item no longer exists.");

    const now = FieldValue.serverTimestamp();
    const by = {byUid: caller.uid, byName: caller.name};
    const base = {
      itemId: original.itemId,
      itemName: original.itemName,
      itemKind: original.itemKind,
      baseUnit: original.baseUnit,
      journalDate: original.journalDate,
      requestId: null,
      reversedById: null,
      ...by,
      createdAt: now,
    };

    let onHand = (typeof item.onHandMilli === "number" ? item.onHandMilli : 0) - Number(original.qtyMilli);
    tx.create(reversalRef, {
      ...base,
      type: "REVERSAL",
      qtyMilli: -Number(original.qtyMilli),
      onHandAfterMilli: onHand,
      note: editing ? `Edited: ${why}` : why,
      reversesId: id,
    });
    tx.update(originalRef, {reversedById: reversalRef.id});

    if (editing && newQty !== 0) {
      onHand += newQty;
      tx.create(replacementRef, {
        ...base,
        type: original.type,
        qtyMilli: newQty,
        onHandAfterMilli: onHand,
        note: original.note ?? null,
        reversesId: null,
        replacesId: id,
      });
    }

    tx.update(itemRef, {onHandMilli: onHand, lastMovementAt: now, updatedAt: now});
    return {alreadyDone: false, onHandMilli: onHand, belowZero: onHand < 0};
  });
});
