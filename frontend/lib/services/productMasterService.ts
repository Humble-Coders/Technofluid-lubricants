// File: frontend/lib/services/productMasterService.ts
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { ProductMaster } from "@/types/productMaster";

export type UpsertProductsResult = {
  created: number;
  updated: number;
};

/**
 * Upserts products by SKU (doc id = sku). createdAt is only set the first
 * time a SKU is written; updatedAt is always refreshed. Firestore batches
 * cap at 500 ops, so rows are chunked defensively even though the current
 * master (320 rows) fits in one batch.
 */
export async function upsertProducts(
  rows: ProductMaster[],
): Promise<UpsertProductsResult> {
  const existingSnap = await getDocs(collection(db, COLLECTIONS.PRODUCTS));
  const existingSkus = new Set(existingSnap.docs.map((d) => d.id));

  let created = 0;
  let updated = 0;

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const row of chunk) {
      const isNew = !existingSkus.has(row.sku);
      const ref = doc(db, COLLECTIONS.PRODUCTS, row.sku);
      batch.set(
        ref,
        {
          ...row,
          updatedAt: serverTimestamp(),
          ...(isNew ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true },
      );
      if (isNew) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    await batch.commit();
  }

  return { created, updated };
}
