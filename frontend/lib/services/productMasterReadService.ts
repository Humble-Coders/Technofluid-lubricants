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

type PriceData = Record<string, unknown>;

/**
 * Prices live in product_prices/{sku} (admin + accounts only). Products not
 * yet migrated still carry the price fields themselves — fall back to those.
 */
function mapProductMaster(
  docSnap: QueryDocumentSnapshot,
  priceData: PriceData | undefined,
): ProductMaster {
  const data = docSnap.data();
  const prices = priceData ?? data;

  return {
    sku: docSnap.id,
    product: String(data.product ?? ""),
    productKey: String(data.productKey ?? ""),
    category: data.category,
    orderableUnit: String(data.orderableUnit ?? ""),
    packQty: Number(data.packQty ?? 0),
    baseUnit: data.baseUnit,
    pricePer: prices.pricePer as ProductMaster["pricePer"],
    dealerPrice: Number(prices.dealerPrice ?? 0),
    distributorPrice: Number(prices.distributorPrice ?? 0),
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
 * Subscribes to the products collection (with each product's prices from
 * product_prices), excluding soft-deleted docs by default (matches the
 * `deleted != true` convention from CLAUDE.md). Admin-only screens use this.
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

  let productDocs: QueryDocumentSnapshot[] | null = null;
  let pricesBySku: Map<string, PriceData> | null = null;
  const emit = () => {
    if (productDocs && pricesBySku) {
      const prices = pricesBySku;
      onChange(productDocs.map((d) => mapProductMaster(d, prices.get(d.id))));
    }
  };
  const fail = (error: Error) => {
    if (onError) {
      onError(error);
    }
  };

  const stopProducts = onSnapshot(
    q,
    (querySnap) => {
      productDocs = querySnap.docs;
      emit();
    },
    fail,
  );
  const stopPrices = onSnapshot(
    collection(db, COLLECTIONS.PRODUCT_PRICES),
    (pricesSnap) => {
      pricesBySku = new Map(pricesSnap.docs.map((d) => [d.id, d.data()]));
      emit();
    },
    // Not allowed to read prices (role without price access, or the price
    // rules aren't deployed yet): show products with their legacy fields.
    () => {
      pricesBySku = new Map();
      emit();
    },
  );

  return () => {
    stopProducts();
    stopPrices();
  };
}
