import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {currentPrices, isPriceField, legacyPriceDeletes, pricesRef} from "./prices";
import {
  currentValue,
  parseProductEdit,
  PUBLIC_CATALOG_FIELDS,
  type EditableField,
  type EditValue,
} from "./productEdit";
import {rebuildFamilyProjection} from "./rebuildFamilyProjection";

/**
 * Admin edits one product from Technofluid Office.
 *
 * Separate from `updateProduct` (which the website admin uses and which still
 * allows pack size/unit/category edits) so the website keeps working unchanged.
 *
 *  - Only the fields in productEdit.ts can change; grade, pack size, unit etc. are locked.
 *  - Prices may be null (no price yet).
 *  - Every changed field is logged in `productChanges` (append-only) with who and when.
 *  - Changed fields are added to `appEdited` on the product, so a later import
 *    from Gaurav's sheet keeps the office value instead of overwriting it.
 *  - Retry-safe: values are absolute, so sending the same edit again changes
 *    nothing and logs nothing.
 */
export const editProduct = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);

  const sku = typeof request.data?.sku === "string" ? request.data.sku.trim() : "";
  if (!sku) throw new HttpsError("invalid-argument", "sku is required.");

  const changes = parseProductEdit(request.data?.changes);

  const rawReason = request.data?.reason;
  const reason =
    typeof rawReason === "string" && rawReason.trim() ?
      rawReason.trim().slice(0, 200) :
      null;

  const db = admin.firestore();
  const productRef = db.collection("products").doc(sku);
  const priceRef = pricesRef(db, sku);

  const result = await db.runTransaction(async (tx) => {
    const productSnap = await tx.get(productRef);
    const product = productSnap.data();
    if (!productSnap.exists || !product || product.deleted === true) {
      throw new HttpsError("not-found", `Product "${sku}" doesn't exist.`);
    }

    const prices = currentPrices((await tx.get(priceRef)).data(), product);

    const before = (field: EditableField): EditValue =>
      isPriceField(field) ? prices[field] : currentValue(product, field);

    const changed = (Object.entries(changes) as [EditableField, EditValue][])
      .filter(([field, value]) => before(field) !== value);

    if (changed.length === 0) {
      return {changed: [] as EditableField[], productKey: String(product.productKey ?? "")};
    }

    const now = FieldValue.serverTimestamp();
    const stamp = {updatedAt: now, updatedBy: {uid: caller.uid, name: caller.name}};

    const productUpdate: Record<string, unknown> = {...stamp};
    const newPrices: Record<string, unknown> = {...prices};
    let pricesChanged = false;
    for (const [field, value] of changed) {
      if (isPriceField(field)) {
        newPrices[field] = value;
        pricesChanged = true;
      } else {
        productUpdate[field] = value;
      }
    }

    // `active` is an office-only switch the importer never writes, so it isn't tracked.
    const tracked = changed.map(([field]) => field).filter((field) => field !== "active");
    if (tracked.length > 0) {
      productUpdate.appEdited = FieldValue.arrayUnion(...tracked);
    }

    // The full price set is written (not just the changed field), so a product
    // still carrying legacy prices moves all of them across in this edit.
    if (pricesChanged) {
      tx.set(priceRef, {...newPrices, ...stamp});
      Object.assign(productUpdate, legacyPriceDeletes());
    }
    tx.update(productRef, productUpdate);

    for (const [field, value] of changed) {
      tx.create(db.collection("productChanges").doc(), {
        sku,
        field,
        old: before(field),
        new: value,
        byUid: caller.uid,
        byName: caller.name,
        at: now,
        reason,
      });
    }

    return {
      changed: changed.map(([field]) => field),
      productKey: String(product.productKey ?? ""),
    };
  });

  if (result.productKey && result.changed.some((f) => PUBLIC_CATALOG_FIELDS.includes(f))) {
    await rebuildFamilyProjection(db, result.productKey);
  }

  return {changed: result.changed};
});
