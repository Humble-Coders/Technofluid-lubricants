// File: frontend/lib/services/rateListService.ts
import {
  collection,
  onSnapshot,
  query,
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
