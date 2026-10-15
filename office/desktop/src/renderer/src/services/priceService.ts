/**
 * Every place the office app reads product PRICES goes through this file.
 *
 * Today prices sit on the product document itself (products/{sku}). The security step
 * of the plan moves them to product_prices/{sku}, readable only by Admin and Accounts —
 * then this file gains its own listener and nothing else should need to change.
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

/** Reads the prices out of a product document's data. */
export function pricesFromDoc(d: Record<string, unknown>): ProductPrices {
  const paise = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  return {
    pricePer: typeof d.pricePer === "string" && d.pricePer ? d.pricePer : null,
    dealerPricePaise: paise(d.dealerPrice),
    distributorPricePaise: paise(d.distributorPrice),
  };
}
