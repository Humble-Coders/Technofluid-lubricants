// File: frontend/lib/services/rateListService.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { RateListEntry } from "@/types/product";

function mapRateListEntry(docSnap: QueryDocumentSnapshot): RateListEntry {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    productId: String(data.productId ?? ""),
    productName: String(data.productName ?? ""),
    distributorId: String(data.distributorId ?? ""),
    price: Number(data.price ?? 0),
    unit: String(data.unit ?? ""),
    effectiveDate: data.effectiveDate ?? null,
  };
}

export async function upsertRateEntry(
  distributorId: string,
  productId: string,
  productName: string,
  price: number,
  unit: string,
): Promise<void> {
  const q = query(
    collection(db, COLLECTIONS.RATE_LISTS),
    where("distributorId", "==", distributorId),
    where("productId", "==", productId),
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    await updateDoc(doc(db, COLLECTIONS.RATE_LISTS, snap.docs[0].id), {
      price,
      unit,
      updatedAt: serverTimestamp(),
    });
  } else {
    await addDoc(collection(db, COLLECTIONS.RATE_LISTS), {
      distributorId,
      productId,
      productName,
      price,
      unit,
      effectiveDate: serverTimestamp(),
    });
  }
}

export async function deleteRateEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.RATE_LISTS, entryId));
}

export function subscribeRateListByDistributor(
  distributorId: string,
  onChange: (entries: RateListEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.RATE_LISTS),
      where("distributorId", "==", distributorId),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapRateListEntry)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}
