import {HttpsError} from "firebase-functions/v2/https";

import {isPriceField, parsePriceField} from "./prices";

/**
 * What an Admin may change on a product from Technofluid Office, and how each
 * value is checked. Fields not listed here are locked — changing them would
 * move the product to another stock pool or break stock maths, so the office
 * app offers "Copy as new product" instead.
 */

export const EDITABLE_FIELDS = [
  "product",
  "orderableUnit",
  "pricePer",
  "dealerPrice",
  "distributorPrice",
  "gstPct",
  "hsnCode",
  "segment",
  "densityKgPerL",
  "active",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const LOCKED_FIELDS = [
  "sku",
  "productKey",
  "grade",
  "packQty",
  "baseUnit",
  "category",
  "recipe",
  "deleted",
] as const;

/**
 * GST slabs after the Sept 2025 rationalisation. Stored as a percent number
 * (website compatibility). 18% on every product today is a placeholder until
 * the client's CA confirms the rate + HSN per product.
 */
export const GST_SLABS = [0, 5, 18, 40] as const;

const SEGMENTS = ["Automotive", "Industrial", "Both"] as const;

/** Edits to these change what the price-free public catalogue shows. */
export const PUBLIC_CATALOG_FIELDS: readonly EditableField[] = [
  "product",
  "orderableUnit",
  "segment",
  "active",
];

export type EditValue = string | number | boolean | null;

export function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") bad(`${label} must be text.`);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) bad(`${label} can't be empty.`);
  if (trimmed.length > max) bad(`${label} must be ${max} characters or fewer.`);
  return trimmed;
}

export function parseField(field: EditableField, value: unknown): EditValue {
  if (isPriceField(field)) return parsePriceField(field, value);

  switch (field) {
  case "product":
    return text(value, "Product name", 120);
  case "orderableUnit":
    return text(value, "Pack label", 80);
  case "gstPct":
    if (typeof value !== "number" || !(GST_SLABS as readonly number[]).includes(value)) {
      bad(`GST must be one of ${GST_SLABS.join("%, ")}%.`);
    }
    return value;
  case "hsnCode": {
    if (value === null) return null;
    if (typeof value !== "string" || !/^(\d{4}|\d{6}|\d{8})$/.test(value.trim())) {
      bad("HSN code must be 4, 6 or 8 digits.");
    }
    return value.trim();
  }
  case "segment":
    if (typeof value !== "string" || !(SEGMENTS as readonly string[]).includes(value)) {
      bad(`"Sold to" must be one of: ${SEGMENTS.join(", ")}.`);
    }
    return value;
  case "densityKgPerL":
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.3 || value > 3) {
      bad("Density must be between 0.3 and 3 kg per litre.");
    }
    return Math.round(value * 10_000) / 10_000;
  case "active":
    if (typeof value !== "boolean") bad("Selling must be on or off.");
    return value;
  default:
    return bad(`"${String(field)}" can't be edited.`);
  }
}

/**
 * Checks the `changes` object sent by the app. Rejects locked or unknown
 * fields by name so the person sees exactly what was wrong.
 */
export function parseProductEdit(changes: unknown): Partial<Record<EditableField, EditValue>> {
  if (typeof changes !== "object" || changes === null || Array.isArray(changes)) {
    bad("changes must be an object.");
  }
  const entries = Object.entries(changes);
  if (entries.length === 0) bad("Nothing to change.");

  const parsed: Partial<Record<EditableField, EditValue>> = {};
  for (const [field, value] of entries) {
    if ((LOCKED_FIELDS as readonly string[]).includes(field)) {
      bad(`"${field}" can't be changed on an existing product — copy it as a new product instead.`);
    }
    if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) {
      bad(`"${field}" is not a product field that can be edited.`);
    }
    parsed[field as EditableField] = parseField(field as EditableField, value);
  }
  return parsed;
}

/** Current value of an editable non-price field on a product doc, normalised for comparison. */
export function currentValue(
  data: Record<string, unknown>,
  field: EditableField,
): EditValue {
  const value = data[field];
  if (field === "active") return value !== false;
  if (value === undefined) return null;
  return value as EditValue;
}
