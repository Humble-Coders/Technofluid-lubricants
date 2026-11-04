import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {rebuildFamilyProjection} from "./rebuildFamilyProjection";

/**
 * Admin soft-deletes (or restores) a product from Technofluid Office.
 *
 *  - Nothing is erased: the product doc stays, with `deleted: true`, so old
 *    records that point at its SKU still resolve. Its prices stay in
 *    product_prices.
 *  - Deleting also switches selling off; restoring leaves it off (switch it
 *    back on deliberately).
 *  - The price-free public catalogue is rebuilt, so the website stops (or
 *    starts again) listing this pack size.
 *  - Logged in `productChanges` as field "deleted". Retry-safe: asking for the
 *    state the product is already in changes and logs nothing.
 */
export const setProductDeleted = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);

  const sku = typeof request.data?.sku === "string" ? request.data.sku.trim() : "";
  if (!sku) throw new HttpsError("invalid-argument", "sku is required.");
  const deleted = request.data?.deleted;
  if (typeof deleted !== "boolean") {
    throw new HttpsError("invalid-argument", "deleted must be true or false.");
  }
  const rawReason = request.data?.reason;
  const reason = typeof rawReason === "string" && rawReason.trim() ?
    rawReason.trim().slice(0, 200) :
    null;

  const db = admin.firestore();
  const ref = db.collection("products").doc(sku);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const product = snap.data();
    if (!snap.exists || !product) {
      throw new HttpsError("not-found", `Product "${sku}" doesn't exist.`);
    }
    const wasDeleted = product.deleted === true;
    if (wasDeleted === deleted) return {changed: false, productKey: String(product.productKey ?? "")};

    const now = FieldValue.serverTimestamp();
    const by = {uid: caller.uid, name: caller.name};
    tx.update(ref, {
      deleted,
      ...(deleted ? {active: false} : {}),
      updatedAt: now,
      updatedBy: by,
    });
    tx.create(db.collection("productChanges").doc(), {
      sku,
      field: "deleted",
      old: wasDeleted,
      new: deleted,
      byUid: caller.uid,
      byName: caller.name,
      at: now,
      reason,
    });
    return {changed: true, productKey: String(product.productKey ?? "")};
  });

  if (result.changed && result.productKey) {
    await rebuildFamilyProjection(db, result.productKey);
  }
  return {changed: result.changed};
});
