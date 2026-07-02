import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { rebuildFamilyProjection } from "./rebuildFamilyProjection";
import { validateProductRow, type ProductRowInput } from "./validateProductRow";

const IMMUTABLE_FIELDS = ["sku", "productKey"];

const EDITABLE_FIELDS = [
  "product",
  "category",
  "orderableUnit",
  "packQty",
  "baseUnit",
  "pricePer",
  "dealerPrice",
  "distributorPrice",
  "gstPct",
  "segment",
  "active",
  "deleted",
];

export const updateProduct = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const db = admin.firestore();

    const callerDoc = await db
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "permission-denied");
    }

    const sku = request.data?.sku;
    const fields = request.data?.fields;
    if (typeof sku !== "string" || !sku.trim()) {
      throw new HttpsError("invalid-argument", "sku is required");
    }
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
      throw new HttpsError("invalid-argument", "fields must be an object");
    }

    for (const key of Object.keys(fields)) {
      if (IMMUTABLE_FIELDS.includes(key)) {
        throw new HttpsError("invalid-argument", `Field "${key}" is immutable`);
      }
      if (!EDITABLE_FIELDS.includes(key)) {
        throw new HttpsError("invalid-argument", `Field "${key}" is not editable`);
      }
    }

    const ref = db.collection("products").doc(sku);
    const existingSnap = await ref.get();
    if (!existingSnap.exists) {
      throw new HttpsError("not-found", `Product "${sku}" does not exist`);
    }
    const existing = existingSnap.data()!;

    const merged: ProductRowInput = {
      sku,
      productKey: existing.productKey,
      product: fields.product ?? existing.product,
      category: fields.category ?? existing.category,
      orderableUnit: fields.orderableUnit ?? existing.orderableUnit,
      packQty: fields.packQty ?? existing.packQty,
      baseUnit: fields.baseUnit ?? existing.baseUnit,
      pricePer: fields.pricePer ?? existing.pricePer,
      dealerPrice: fields.dealerPrice ?? existing.dealerPrice,
      distributorPrice: fields.distributorPrice ?? existing.distributorPrice,
      gstPct: fields.gstPct ?? existing.gstPct,
      segment: fields.segment ?? existing.segment,
    };

    const result = validateProductRow(merged);
    if (!result.valid) {
      throw new HttpsError("invalid-argument", result.reason);
    }

    const active = fields.active ?? existing.active ?? true;
    const deleted = fields.deleted ?? existing.deleted ?? false;
    if (typeof active !== "boolean") {
      throw new HttpsError("invalid-argument", "active must be a boolean");
    }
    if (typeof deleted !== "boolean") {
      throw new HttpsError("invalid-argument", "deleted must be a boolean");
    }

    await ref.set(
      {
        product: result.product.product,
        category: result.product.category,
        orderableUnit: result.product.orderableUnit,
        packQty: result.product.packQty,
        baseUnit: result.product.baseUnit,
        pricePer: result.product.pricePer,
        dealerPrice: result.product.dealerPrice,
        distributorPrice: result.product.distributorPrice,
        gstPct: result.product.gstPct,
        segment: result.product.segment,
        active,
        deleted,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await rebuildFamilyProjection(db, existing.productKey);

    return { success: true };
  },
);
