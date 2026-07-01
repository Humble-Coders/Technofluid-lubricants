import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import {
  buildPublicCatalogDoc,
  type PublicCatalogProduct,
} from "./buildPublicCatalogDoc";

const CATEGORY_VALUES = ["bulk_oil", "grease", "retail"];
const BASE_UNITS = ["L", "kg", "piece"];
const PRICE_PER_VALUES = [
  "per litre",
  "per kg",
  "per case",
  "per bucket",
  "per piece",
];
const SEGMENT_VALUES = ["Automotive", "Industrial", "Both"];

// Firestore document ids may not be empty, contain "/", or be "." / "..".
const INVALID_ID_RE = /\/|^\.\.?$/;

type ProductInput = {
  rowNumber: number;
  sku: string;
  product: string;
  productKey: string;
  category: string;
  orderableUnit: string;
  packQty: number;
  baseUnit: string;
  pricePer: string;
  dealerPrice: number;
  distributorPrice: number;
  gstPct: number;
  segment: string;
};

type ValidatedRow = { rowNumber: number; product: ProductInput };
type InvalidRow = { rowNumber: number; reason: string };

function validateRow(
  row: ProductInput,
  seenSkus: Set<string>,
): { valid: true; product: ProductInput } | { valid: false; reason: string } {
  const sku = typeof row.sku === "string" ? row.sku.trim() : "";
  if (!sku) return { valid: false, reason: "SKU is required" };
  if (INVALID_ID_RE.test(sku) || sku.length > 1500) {
    return { valid: false, reason: `SKU "${sku}" is not a valid document id` };
  }
  if (seenSkus.has(sku)) {
    return { valid: false, reason: `Duplicate SKU "${sku}" in payload` };
  }

  const product = typeof row.product === "string" ? row.product.trim() : "";
  if (!product) return { valid: false, reason: "Product name is required" };

  if (!CATEGORY_VALUES.includes(row.category)) {
    return { valid: false, reason: `Category "${row.category}" is invalid` };
  }

  const orderableUnit =
    typeof row.orderableUnit === "string" ? row.orderableUnit.trim() : "";
  if (!orderableUnit) {
    return { valid: false, reason: "Orderable unit is required" };
  }

  if (
    typeof row.packQty !== "number" ||
    !Number.isFinite(row.packQty) ||
    row.packQty <= 0
  ) {
    return { valid: false, reason: "Pack qty must be a number greater than 0" };
  }

  if (!BASE_UNITS.includes(row.baseUnit)) {
    return { valid: false, reason: `Base unit "${row.baseUnit}" is invalid` };
  }

  if (!PRICE_PER_VALUES.includes(row.pricePer)) {
    return { valid: false, reason: `Price per "${row.pricePer}" is invalid` };
  }

  if (
    typeof row.dealerPrice !== "number" ||
    !Number.isInteger(row.dealerPrice) ||
    row.dealerPrice < 0
  ) {
    return { valid: false, reason: "Dealer price must be an integer ≥ 0 (paise)" };
  }

  if (
    typeof row.distributorPrice !== "number" ||
    !Number.isInteger(row.distributorPrice) ||
    row.distributorPrice < 0
  ) {
    return {
      valid: false,
      reason: "Distributor price must be an integer ≥ 0 (paise)",
    };
  }

  if (
    typeof row.gstPct !== "number" ||
    !Number.isFinite(row.gstPct) ||
    row.gstPct < 0
  ) {
    return { valid: false, reason: "GST % must be a number ≥ 0" };
  }

  if (!SEGMENT_VALUES.includes(row.segment)) {
    return { valid: false, reason: `Segment "${row.segment}" is invalid` };
  }

  const productKey =
    typeof row.productKey === "string" ? row.productKey.trim() : "";
  if (!productKey) {
    return { valid: false, reason: "Product key is required" };
  }

  seenSkus.add(sku);

  return {
    valid: true,
    product: {
      ...row,
      sku,
      product,
      orderableUnit,
      productKey,
    },
  };
}

/**
 * Commits Firestore writes in chunks of ≤500 ops (batch limit), spanning
 * both the products and public_catalog writes for this import.
 */
async function commitInChunks(
  db: admin.firestore.Firestore,
  ops: ((batch: admin.firestore.WriteBatch) => void)[],
): Promise<void> {
  const CHUNK_SIZE = 500;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK_SIZE).forEach((op) => op(batch));
    await batch.commit();
  }
}

export const importProducts = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "permission-denied");
    }

    const rows = request.data?.rows as ProductInput[] | undefined;
    if (!Array.isArray(rows)) {
      throw new HttpsError("invalid-argument", "rows must be an array");
    }

    const seenSkus = new Set<string>();
    const validated: ValidatedRow[] = [];
    const invalid: InvalidRow[] = [];

    for (const row of rows) {
      const result = validateRow(row, seenSkus);
      if (result.valid) {
        validated.push({ rowNumber: row.rowNumber, product: result.product });
      } else {
        invalid.push({ rowNumber: row.rowNumber, reason: result.reason });
      }
    }

    const db = admin.firestore();
    const existingSnap = await db.collection("products").get();
    const existingBySku = new Map(
      existingSnap.docs.map((d) => [d.id, d.data()]),
    );

    let created = 0;
    let updated = 0;
    const now = admin.firestore.FieldValue.serverTimestamp();

    const productOps: ((batch: admin.firestore.WriteBatch) => void)[] = [];
    const familyProducts = new Map<string, PublicCatalogProduct[]>();

    for (const { product: row } of validated) {
      const existing = existingBySku.get(row.sku);
      const isNew = !existing;
      const ref = db.collection("products").doc(row.sku);

      const catalogFields = {
        product: row.product,
        productKey: row.productKey,
        category: row.category,
        orderableUnit: row.orderableUnit,
        packQty: row.packQty,
        baseUnit: row.baseUnit,
        pricePer: row.pricePer,
        dealerPrice: row.dealerPrice,
        distributorPrice: row.distributorPrice,
        gstPct: row.gstPct,
        segment: row.segment,
        updatedAt: now,
      };

      if (isNew) {
        created += 1;
        productOps.push((batch) =>
          batch.set(ref, {
            ...catalogFields,
            sku: row.sku,
            active: true,
            deleted: false,
            createdAt: now,
          }),
        );
      } else {
        updated += 1;
        productOps.push((batch) => batch.set(ref, catalogFields, { merge: true }));
      }

      const active = isNew ? true : (existing!.active ?? true);
      const deleted = isNew ? false : (existing!.deleted ?? false);

      const family = familyProducts.get(row.productKey) ?? [];
      family.push({
        productKey: row.productKey,
        product: row.product,
        category: row.category,
        segment: row.segment,
        orderableUnit: row.orderableUnit,
        active,
        deleted,
      });
      familyProducts.set(row.productKey, family);
    }

    let families = 0;
    const catalogOps: ((batch: admin.firestore.WriteBatch) => void)[] = [];
    for (const [productKey, familyRows] of familyProducts) {
      const ref = db.collection("public_catalog").doc(productKey);
      const doc = buildPublicCatalogDoc(productKey, familyRows);
      if (doc) {
        families += 1;
        catalogOps.push((batch) => batch.set(ref, doc));
      } else {
        catalogOps.push((batch) => batch.delete(ref));
      }
    }

    await commitInChunks(db, [...productOps, ...catalogOps]);

    return {
      created,
      updated,
      skipped: invalid.length,
      invalid,
      families,
    };
  },
);
