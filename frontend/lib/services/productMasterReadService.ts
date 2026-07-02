// File: frontend/lib/services/productMasterReadService.ts
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
import type { ProductMaster } from "@/types/productMaster";

function mapProductMaster(docSnap: QueryDocumentSnapshot): ProductMaster {
  const data = docSnap.data();

  return {
    sku: docSnap.id,
    product: String(data.product ?? ""),
    productKey: String(data.productKey ?? ""),
    category: data.category,
    orderableUnit: String(data.orderableUnit ?? ""),
    packQty: Number(data.packQty ?? 0),
    baseUnit: data.baseUnit,
    pricePer: data.pricePer,
    dealerPrice: Number(data.dealerPrice ?? 0),
    distributorPrice: Number(data.distributorPrice ?? 0),
    gstPct: Number(data.gstPct ?? 0),
    segment: data.segment,
    active: Boolean(data.active ?? true),
    deleted: Boolean(data.deleted ?? false),
    description: data.description,
    imageUrl: data.imageUrl,
    imagePath: data.imagePath,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

/**
 * Subscribes to the products collection, excluding soft-deleted docs by
 * default (matches the `deleted != true` convention from CLAUDE.md).
 */
export function subscribeProductMaster(
  onChange: (products: ProductMaster[]) => void,
  onError?: (error: Error) => void,
  options?: { includeDeleted?: boolean },
): Unsubscribe {
  const productsRef = collection(db, COLLECTIONS.PRODUCTS);
  const q = options?.includeDeleted
    ? query(productsRef)
    : query(productsRef, where("deleted", "!=", true));

  return onSnapshot(
    q,
    (querySnap) => onChange(querySnap.docs.map(mapProductMaster)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}
