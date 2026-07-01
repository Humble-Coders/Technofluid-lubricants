// File: frontend/lib/services/productImport.ts
import * as XLSX from "xlsx";

import type {
  ProductBaseUnit,
  ProductCategory,
  ProductMaster,
  ProductPricePer,
  ProductSegmentTag,
} from "@/types/productMaster";

export const PRODUCT_MASTER_SHEET_NAME = "Product Master";

const CATEGORY_MAP: Record<string, ProductCategory> = {
  "Bulk oil": "bulk_oil",
  Grease: "grease",
  "Retail pack": "retail",
};

const BASE_UNITS: ProductBaseUnit[] = ["L", "kg", "piece"];

const PRICE_PER_VALUES: ProductPricePer[] = [
  "per litre",
  "per kg",
  "per case",
  "per bucket",
  "per piece",
];

const SEGMENT_VALUES: ProductSegmentTag[] = ["Automotive", "Industrial", "Both"];

export class ProductMasterFileError extends Error {}

type RawRow = Record<string, unknown>;

export type RowValidationResult =
  | { valid: true; product: ProductMaster; rowNumber: number }
  | { valid: false; reason: string; rowNumber: number; raw: RawRow };

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parses an uploaded .xlsx file and returns the raw rows of the
 * "Product Master" sheet. Throws ProductMasterFileError for anything that
 * would otherwise silently produce a partial/empty import.
 */
export async function parseProductMasterFile(file: File): Promise<RawRow[]> {
  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    throw new ProductMasterFileError(
      "Could not read this file. Make sure it's a valid .xlsx workbook.",
    );
  }

  const sheet = workbook.Sheets[PRODUCT_MASTER_SHEET_NAME];
  if (!sheet) {
    throw new ProductMasterFileError(
      `This workbook has no sheet named "${PRODUCT_MASTER_SHEET_NAME}".`,
    );
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
  if (rows.length === 0) {
    throw new ProductMasterFileError(
      `The "${PRODUCT_MASTER_SHEET_NAME}" sheet has no data rows.`,
    );
  }

  return rows;
}

/** Validates and maps one raw sheet row against the products schema (col A-K). */
export function validateRow(
  raw: RawRow,
  rowNumber: number,
  seenSkus: Set<string>,
): RowValidationResult {
  const sku = toTrimmedString(raw["SKU"]);
  if (!sku) {
    return { valid: false, reason: "SKU is required", rowNumber, raw };
  }
  if (seenSkus.has(sku)) {
    return { valid: false, reason: `Duplicate SKU "${sku}" in file`, rowNumber, raw };
  }

  const productName = toTrimmedString(raw["Product"]);
  if (!productName) {
    return { valid: false, reason: "Product name is required", rowNumber, raw };
  }

  const rawCategory = toTrimmedString(raw["Category"]);
  const category = CATEGORY_MAP[rawCategory];
  if (!category) {
    return {
      valid: false,
      reason: `Category "${rawCategory || "(empty)"}" is not one of Bulk oil / Grease / Retail pack`,
      rowNumber,
      raw,
    };
  }

  const rawOrderableUnit = toTrimmedString(raw["Orderable unit"]);
  if (!rawOrderableUnit) {
    return { valid: false, reason: "Orderable unit is required", rowNumber, raw };
  }
  const orderableUnit = collapseWhitespace(rawOrderableUnit);

  const packQty = toNumber(raw["Pack qty"]);
  if (packQty === null || packQty <= 0) {
    return { valid: false, reason: "Pack qty must be a number greater than 0", rowNumber, raw };
  }

  const rawBaseUnit = toTrimmedString(raw["Base unit"]) as ProductBaseUnit;
  if (!BASE_UNITS.includes(rawBaseUnit)) {
    return {
      valid: false,
      reason: `Base unit "${rawBaseUnit || "(empty)"}" is not one of L / kg / piece`,
      rowNumber,
      raw,
    };
  }

  const rawPricePer = toTrimmedString(raw["Price per"]) as ProductPricePer;
  if (!PRICE_PER_VALUES.includes(rawPricePer)) {
    return {
      valid: false,
      reason: `Price per "${rawPricePer || "(empty)"}" is not a recognized unit`,
      rowNumber,
      raw,
    };
  }

  const dealerRupees = toNumber(raw["Dealer price"]);
  if (dealerRupees === null || dealerRupees < 0) {
    return { valid: false, reason: "Dealer price must be a number", rowNumber, raw };
  }

  const distributorRupees = toNumber(raw["Distributor price"]);
  if (distributorRupees === null || distributorRupees < 0) {
    return { valid: false, reason: "Distributor price must be a number", rowNumber, raw };
  }

  const gstPct = toNumber(raw["GST %"]);
  if (gstPct === null || gstPct < 0) {
    return { valid: false, reason: "GST % must be a number", rowNumber, raw };
  }

  const rawSegment = toTrimmedString(raw["Visible to"]) as ProductSegmentTag;
  if (!SEGMENT_VALUES.includes(rawSegment)) {
    return {
      valid: false,
      reason: `Visible to "${rawSegment || "(empty)"}" is not one of Automotive / Industrial / Both`,
      rowNumber,
      raw,
    };
  }

  seenSkus.add(sku);

  const product: ProductMaster = {
    sku,
    product: productName,
    productKey: slugify(productName),
    category,
    orderableUnit,
    packQty,
    baseUnit: rawBaseUnit,
    pricePer: rawPricePer,
    dealerPrice: Math.round(dealerRupees * 100),
    distributorPrice: Math.round(distributorRupees * 100),
    gstPct,
    segment: rawSegment,
    active: true,
    deleted: false,
  };

  return { valid: true, product, rowNumber };
}

export type ProductImportResult = {
  valid: ProductMaster[];
  invalid: { rowNumber: number; reason: string; raw: RawRow }[];
};

export function mapAndValidateRows(rawRows: RawRow[]): ProductImportResult {
  const seenSkus = new Set<string>();
  const valid: ProductMaster[] = [];
  const invalid: { rowNumber: number; reason: string; raw: RawRow }[] = [];

  rawRows.forEach((raw, index) => {
    // +2: header row + 1-indexing, to match spreadsheet row numbers
    const rowNumber = index + 2;
    const result = validateRow(raw, rowNumber, seenSkus);
    if (result.valid) {
      valid.push(result.product);
    } else {
      invalid.push({ rowNumber: result.rowNumber, reason: result.reason, raw: result.raw });
    }
  });

  return { valid, invalid };
}
