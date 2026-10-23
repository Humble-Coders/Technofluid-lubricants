import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

/**
 * Every Cloud Function read/write of product PRICES goes through this file.
 *
 * Prices live in product_prices/{sku}, readable only by admin and accounts
 * (Firestore can't hide single fields, and Stock & Production reads
 * products/{sku}). Older product docs may still carry the price fields until
 * scripts/migrate-product-prices.mjs has run — reads fall back to them, and
 * every write strips them from the product doc.
 */

export const PRICES_COLLECTION = "product_prices";

export const PRICE_PER_VALUES = [
  "per litre",
  "per kg",
  "per case",
  "per bucket",
  "per piece",
] as const;

export const PRICE_FIELDS = ["pricePer", "dealerPrice", "distributorPrice"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

export interface ProductPrices {
  pricePer: string | null;
  /** Integer paise (GST-exclusive), or null when no price has been set yet. */
  dealerPrice: number | null;
  distributorPrice: number | null;
}

/** ₹1 crore — far above any real price; stops a typo like an extra six zeros. */
const MAX_PRICE_PAISE = 1_00_00_000_00;

export function isPriceField(field: string): field is PriceField {
  return (PRICE_FIELDS as readonly string[]).includes(field);
}

/** Where a product's prices are stored. */
export function pricesRef(
  db: admin.firestore.Firestore,
  sku: string,
): admin.firestore.DocumentReference {
  return db.collection(PRICES_COLLECTION).doc(sku);
}

/**
 * A product's current prices: the product_prices doc, or — for a product not
 * migrated yet — the legacy fields on the product doc itself.
 */
export function currentPrices(
  priceData: admin.firestore.DocumentData | undefined,
  productData: admin.firestore.DocumentData | undefined,
): ProductPrices {
  return pricesFromData(priceData ?? productData);
}

/** Field deletes that strip legacy prices from a product doc on write. */
export function legacyPriceDeletes(): Record<PriceField, FieldValue> {
  const del = FieldValue.delete();
  return {pricePer: del, dealerPrice: del, distributorPrice: del};
}

/** Splits a product row into its price fields and everything else. */
export function splitPrices<T extends Record<string, unknown>>(
  row: T,
): { prices: Partial<Record<PriceField, unknown>>; rest: Omit<T, PriceField> } {
  const prices: Partial<Record<PriceField, unknown>> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (isPriceField(key)) prices[key] = value;
    else rest[key] = value;
  }
  return {prices, rest: rest as Omit<T, PriceField>};
}

/** Reads the prices out of the document `pricesRef` points to. */
export function pricesFromData(
  data: admin.firestore.DocumentData | undefined,
): ProductPrices {
  const paise = (x: unknown) =>
    typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null;
  return {
    pricePer: typeof data?.pricePer === "string" ? data.pricePer : null,
    dealerPrice: paise(data?.dealerPrice),
    distributorPrice: paise(data?.distributorPrice),
  };
}

/** Validates one incoming price field. Throws a readable error if it's wrong. */
export function parsePriceField(field: PriceField, value: unknown): string | number | null {
  if (field === "pricePer") {
    if (typeof value !== "string" || !(PRICE_PER_VALUES as readonly string[]).includes(value)) {
      throw new HttpsError(
        "invalid-argument",
        `"Price per" must be one of: ${PRICE_PER_VALUES.join(", ")}.`,
      );
    }
    return value;
  }

  const label = field === "dealerPrice" ? "Dealer price" : "Distributor price";
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_PRICE_PAISE
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be a whole number of paise between 0 and ₹1,00,00,000.`,
    );
  }
  return value;
}
