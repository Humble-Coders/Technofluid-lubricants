import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import {
  buildPublicCatalogDoc,
  type PublicCatalogProduct,
} from "./buildPublicCatalogDoc";
import { validateProductRow, type ProductRowInput } from "./validateProductRow";

type ImportRow = ProductRowInput & { rowNumber: number };

type ValidatedRow = { rowNumber: number; product: ProductRowInput };
type InvalidRow = { rowNumber: number; reason: string };

/**
 * Commits Firestore writes in chunks of ≤500 ops (batch limit).
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

    const rows = request.data?.rows as ImportRow[] | undefined;
    if (!Array.isArray(rows)) {
      throw new HttpsError("invalid-argument", "rows must be an array");
    }

    const seenSkus = new Set<string>();
    const validated: ValidatedRow[] = [];
    const invalid: InvalidRow[] = [];

    for (const row of rows) {
      const result = validateProductRow(row, seenSkus);
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
    const affectedProductKeys = new Set<string>();

    // Full post-write product state, keyed by sku — the already-loaded
    // existing docs merged with this batch's updates. Used below to rebuild
    // public_catalog from every family's complete variant set (not just the
    // batch), without any extra Firestore reads.
    const mergedBySku = new Map<string, PublicCatalogProduct>(
      existingSnap.docs.map((d) => {
        const data = d.data();
        return [
          d.id,
          {
            productKey: data.productKey,
            product: data.product,
            category: data.category,
            segment: data.segment,
            orderableUnit: data.orderableUnit,
            active: data.active ?? true,
            deleted: data.deleted ?? false,
          },
        ];
      }),
    );

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
      mergedBySku.set(row.sku, {
        productKey: row.productKey,
        product: row.product,
        category: row.category,
        segment: row.segment,
        orderableUnit: row.orderableUnit,
        active,
        deleted,
      });

      affectedProductKeys.add(row.productKey);
      // A SKU's productKey may change on re-import; also rebuild the old family.
      const previousProductKey = existing?.productKey as string | undefined;
      if (previousProductKey && previousProductKey !== row.productKey) {
        affectedProductKeys.add(previousProductKey);
      }
    }

    await commitInChunks(db, productOps);

    // Group the full merged product state by productKey, then rebuild
    // public_catalog for each affected family from its complete current
    // variant set — not just this batch — so a partial import never drops a
    // family's other, not-reuploaded pack sizes.
    const familyProducts = new Map<string, PublicCatalogProduct[]>();
    for (const product of mergedBySku.values()) {
      const family = familyProducts.get(product.productKey) ?? [];
      family.push(product);
      familyProducts.set(product.productKey, family);
    }

    const catalogOps: ((batch: admin.firestore.WriteBatch) => void)[] = [];
    for (const productKey of affectedProductKeys) {
      const ref = db.collection("public_catalog").doc(productKey);
      const doc = buildPublicCatalogDoc(productKey, familyProducts.get(productKey) ?? []);
      if (doc) {
        catalogOps.push((batch) => batch.set(ref, doc));
      } else {
        catalogOps.push((batch) => batch.delete(ref));
      }
    }

    await commitInChunks(db, catalogOps);

    return {
      created,
      updated,
      skipped: invalid.length,
      invalid,
      families: affectedProductKeys.size,
    };
  },
);
