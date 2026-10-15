import * as admin from "firebase-admin";
import {HttpsError} from "firebase-functions/v2/https";

/**
 * Every Cloud Function read/write of product PRICES goes through this file.
 *
 * Today prices live on the product doc itself (products/{sku}). The security
 * step of the plan moves them to product_prices/{sku} (readable by admin and
 * accounts only) — when that happens, only this file should need to change.
 */

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
  return db.collection("products").doc(sku);
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
