const CATEGORY_VALUES = ["bulk_oil", "grease", "retail"];
const BASE_UNITS = ["L", "kg", "piece"];
const PRICE_PER_VALUES = [
  "per litre",
  "per kg",
  "per case",
  "per bucket",
  "per piece",
];
const SEGMENT_VALUES = ["Automotive", "Industrial", "Both"];

// Firestore document ids may not be empty, contain "/", or be "." / "..".
const INVALID_ID_RE = /\/|^\.\.?$/;

export type ProductRowInput = {
  sku: string;
  product: string;
  productKey: string;
  category: string;
  orderableUnit: string;
  packQty: number;
  baseUnit: string;
  pricePer: string;
  dealerPrice: number;
  distributorPrice: number;
  gstPct: number;
  segment: string;
};

export type ValidateProductRowResult =
  | { valid: true; product: ProductRowInput }
  | { valid: false; reason: string };

/**
 * Validates one full product row (required/enum/integer-paise/SKU-id
 * checks). Shared by importProducts, updateProduct, and createProduct so
 * the constraints stay in one place.
 */
export function validateProductRow(
  row: ProductRowInput,
  seenSkus?: Set<string>,
): ValidateProductRowResult {
  const sku = typeof row.sku === "string" ? row.sku.trim() : "";
  if (!sku) return { valid: false, reason: "SKU is required" };
  if (INVALID_ID_RE.test(sku) || sku.length > 1500) {
    return { valid: false, reason: `SKU "${sku}" is not a valid document id` };
  }
  if (seenSkus?.has(sku)) {
    return { valid: false, reason: `Duplicate SKU "${sku}" in payload` };
  }

  const product = typeof row.product === "string" ? row.product.trim() : "";
  if (!product) return { valid: false, reason: "Product name is required" };

  if (!CATEGORY_VALUES.includes(row.category)) {
    return { valid: false, reason: `Category "${row.category}" is invalid` };
  }

  const orderableUnit =
    typeof row.orderableUnit === "string" ? row.orderableUnit.trim() : "";
  if (!orderableUnit) {
    return { valid: false, reason: "Orderable unit is required" };
  }

  if (
    typeof row.packQty !== "number" ||
    !Number.isFinite(row.packQty) ||
    row.packQty <= 0
  ) {
    return { valid: false, reason: "Pack qty must be a number greater than 0" };
  }

  if (!BASE_UNITS.includes(row.baseUnit)) {
    return { valid: false, reason: `Base unit "${row.baseUnit}" is invalid` };
  }

  if (!PRICE_PER_VALUES.includes(row.pricePer)) {
    return { valid: false, reason: `Price per "${row.pricePer}" is invalid` };
  }

  if (
    typeof row.dealerPrice !== "number" ||
    !Number.isInteger(row.dealerPrice) ||
    row.dealerPrice < 0
  ) {
    return { valid: false, reason: "Dealer price must be an integer ≥ 0 (paise)" };
  }

  if (
    typeof row.distributorPrice !== "number" ||
    !Number.isInteger(row.distributorPrice) ||
    row.distributorPrice < 0
  ) {
    return {
      valid: false,
      reason: "Distributor price must be an integer ≥ 0 (paise)",
    };
  }

  if (
    typeof row.gstPct !== "number" ||
    !Number.isFinite(row.gstPct) ||
    row.gstPct < 0
  ) {
    return { valid: false, reason: "GST % must be a number ≥ 0" };
  }

  if (!SEGMENT_VALUES.includes(row.segment)) {
    return { valid: false, reason: `Segment "${row.segment}" is invalid` };
  }

  const productKey =
    typeof row.productKey === "string" ? row.productKey.trim() : "";
  if (!productKey) {
    return { valid: false, reason: "Product key is required" };
  }

  seenSkus?.add(sku);

  return {
    valid: true,
    product: {
      ...row,
      sku,
      product,
      orderableUnit,
      productKey,
    },
  };
}
