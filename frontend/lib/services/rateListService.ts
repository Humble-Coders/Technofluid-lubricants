// File: frontend/lib/services/rateListService.ts
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { RateListEntry } from "@/types/product";

// New path: rate_lists/{distributorId}/products/{productId}
// The global rate list uses distributorId = "global".
const PRODUCTS_SUBCOLLECTION = "products";
const GLOBAL_RATE_LIST_ID = "global";

function mapRateListEntry(docSnap: QueryDocumentSnapshot): RateListEntry {
  const data = docSnap.data();

  return {
    id: docSnap.id, // == productId in new structure
    productId: String(data.productId ?? docSnap.id),
    productName: String(data.productName ?? ""),
    distributorId: String(data.distributorId ?? GLOBAL_RATE_LIST_ID),
    price: Number(data.price ?? 0),
    unit: String(data.unit ?? ""),
    effectiveDate: data.effectiveDate ?? null,
  };
}

export async function upsertRateEntry(
  productId: string,
  productName: string,
  price: number,
  unit: string,
  distributorId: string = GLOBAL_RATE_LIST_ID,
): Promise<void> {
  const entryRef = doc(
    db,
    COLLECTIONS.RATE_LISTS,
    distributorId,
    PRODUCTS_SUBCOLLECTION,
    productId,
  );

  await setDoc(entryRef, {
    productId,
    productName,
    distributorId,
    price,
    unit,
    effectiveDate: serverTimestamp(),
  });
}

export async function deleteRateEntry(
  productId: string,
  distributorId: string = GLOBAL_RATE_LIST_ID,
): Promise<void> {
  await deleteDoc(
    doc(db, COLLECTIONS.RATE_LISTS, distributorId, PRODUCTS_SUBCOLLECTION, productId),
  );
}

export function subscribeGlobalRateList(
  onChange: (entries: RateListEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(
        db,
        COLLECTIONS.RATE_LISTS,
        GLOBAL_RATE_LIST_ID,
        PRODUCTS_SUBCOLLECTION,
      ),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapRateListEntry)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeDistributorRateList(
  distributorId: string,
  onChange: (entries: RateListEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(
        db,
        COLLECTIONS.RATE_LISTS,
        distributorId,
        PRODUCTS_SUBCOLLECTION,
      ),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapRateListEntry)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

/**
 * Run once manually from admin panel, then delete.
 * Reads all flat rate_lists docs and rewrites to the
 * rate_lists/{distributorId}/products/{productId} subcollection.
 */
export async function migrateRateLists(): Promise<void> {
  const snap = await getDocs(collection(db, COLLECTIONS.RATE_LISTS));

  const writes: Promise<void>[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const productId = String(data.productId ?? "").trim();
    if (!productId) continue;

    const distributorId = String(data.distributorId ?? GLOBAL_RATE_LIST_ID).trim();
    const entryRef = doc(
      db,
      COLLECTIONS.RATE_LISTS,
      distributorId,
      PRODUCTS_SUBCOLLECTION,
      productId,
    );

    writes.push(
      setDoc(entryRef, {
        productId,
        productName: String(data.productName ?? ""),
        distributorId,
        price: Number(data.price ?? 0),
        unit: String(data.unit ?? ""),
        effectiveDate: data.effectiveDate ?? serverTimestamp(),
      }),
    );
  }

  await Promise.all(writes);
}
