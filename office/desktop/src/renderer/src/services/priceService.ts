import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Every place the office app reads product PRICES goes through this file.
 *
 * Prices live in product_prices/{sku}, readable only by Admin and Accounts (security
 * rules) — Stock & Production can't read them at all. Products not yet migrated still
 * carry the old price fields on products/{sku}; reads fall back to those.
 * (Saving prices goes through the editProduct Cloud Function, see productEditService.)
 */

export const PRICE_PER_OPTIONS = ["per litre", "per kg", "per case", "per bucket", "per piece"] as const;
export type PricePer = (typeof PRICE_PER_OPTIONS)[number];

export interface ProductPrices {
  pricePer: string | null;
  /** Integer paise (GST-exclusive), or null when no price has been set yet. */
  dealerPricePaise: number | null;
  distributorPricePaise: number | null;
}

/** Live prices for every product, keyed by SKU (Admin / Accounts only). */
export function watchPrices(
  onChange: (prices: Map<string, Record<string, unknown>>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "product_prices"),
    (snap) => onChange(new Map(snap.docs.map((doc) => [doc.id, doc.data()]))),
    onError,
  );
}

/** Reads the prices out of a product_prices doc (or a not-yet-migrated product doc). */
export function pricesFromDoc(d: Record<string, unknown>): ProductPrices {
  const paise = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  return {
    pricePer: typeof d.pricePer === "string" && d.pricePer ? d.pricePer : null,
    dealerPricePaise: paise(d.dealerPrice),
    distributorPricePaise: paise(d.distributorPrice),
  };
}
