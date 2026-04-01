// File: frontend/lib/services/productService.ts
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
import type { Product } from "@/types/product";

function mapProduct(docSnap: QueryDocumentSnapshot): Product {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    name: String(data.name ?? ""),
    description: data.description ? String(data.description) : undefined,
    basePrice: Number(data.basePrice ?? 0),
    unit: String(data.unit ?? ""),
    category: data.category ? String(data.category) : undefined,
    isActive: Boolean(data.isActive ?? true),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export function subscribeActiveProducts(
  onChange: (products: Product[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.PRODUCTS),
      where("isActive", "==", true),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapProduct)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}
