import { paiseToRupees, rupeesToPaise } from "@technofluid/core";
import type { Product } from "@/services/productService";
import { GST_SLABS, type NewProduct, type ProductChanges } from "@/services/productEditService";
import { PRICE_PER_OPTIONS } from "@/services/priceService";

/**
 * The product form's values (as typed) and how they turn into what is sent to the
 * editProduct / addProduct Cloud Functions. Kept out of the screen so the rules sit in
 * one place; the Cloud Functions check everything again.
 */

export interface ProductFormValues {
  name: string;
  packLabel: string;
  pricePer: string;
  /** Rupees as typed, e.g. "1250.50"; empty = no price. */
  dealerPrice: string;
  distributorPrice: string;
  gstPct: string;
  hsnCode: string;
  segment: string;
  density: string;
  active: boolean;
  // Only used when adding a product (locked on existing ones):
  sku: string;
  grade: string;
  category: string;
  packQty: string;
  baseUnit: string;
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;

const rupeesText = (paise: number | null): string => (paise === null ? "" : paiseToRupees(paise).toFixed(2));

export function formValuesFor(p: Product): ProductFormValues {
  return {
    name: p.name,
    packLabel: p.packLabel,
    pricePer: p.pricePer ?? "",
    dealerPrice: rupeesText(p.dealerPricePaise),
    distributorPrice: rupeesText(p.distributorPricePaise),
    gstPct: String(p.gstPct),
    hsnCode: p.hsnCode ?? "",
    segment: p.segment ?? "",
    density: p.densityKgPerL === null ? "" : String(p.densityKgPerL),
    active: p.active,
    sku: p.sku,
    grade: p.grade,
    category: p.category,
    packQty: String(p.packQty),
    baseUnit: p.baseUnit,
  };
}

export const EMPTY_FORM: ProductFormValues = {
  name: "",
  packLabel: "",
  pricePer: "per litre",
  dealerPrice: "",
  distributorPrice: "",
  gstPct: "18",
  hsnCode: "",
  segment: "Both",
  density: "",
  active: true,
  sku: "",
  grade: "",
  category: "bulk_oil",
  packQty: "",
  baseUnit: "L",
};

/** Empty → null; otherwise exact paise, or an error message. */
export function parsePrice(text: string): { paise: number | null } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { paise: null };
  try {
    const paise = rupeesToPaise(trimmed);
    if (paise < 0) return { error: "Can't be negative." };
    if (paise > 1_00_00_000_00) return { error: "Over ₹1 crore — check it." };
    return { paise };
  } catch {
    return { error: "Enter an amount like 1250.50." };
  }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Checks the fields shared by edit and add. */
function readShared(values: ProductFormValues, errors: ProductFormErrors) {
  const name = clean(values.name);
  if (!name) errors.name = "Required.";
  const packLabel = clean(values.packLabel);
  if (!packLabel) errors.packLabel = "Required.";

  const pricePer = values.pricePer;
  if (!(PRICE_PER_OPTIONS as readonly string[]).includes(pricePer)) errors.pricePer = "Choose one.";

  const dealer = parsePrice(values.dealerPrice);
  if ("error" in dealer) errors.dealerPrice = dealer.error;
  const distributor = parsePrice(values.distributorPrice);
  if ("error" in distributor) errors.distributorPrice = distributor.error;

  const gstPct = Number(values.gstPct);
  if (!(GST_SLABS as readonly number[]).includes(gstPct)) errors.gstPct = "Choose a rate.";

  const hsn = values.hsnCode.trim();
  if (hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) errors.hsnCode = "4, 6 or 8 digits.";

  const segment = values.segment;
  if (segment !== "Automotive" && segment !== "Industrial" && segment !== "Both") errors.segment = "Choose one.";

  const densityText = values.density.trim();
  const density = densityText ? Number(densityText) : null;
  if (density !== null && (!Number.isFinite(density) || density < 0.3 || density > 3)) {
    errors.density = "Between 0.3 and 3.";
  }

  return {
    name,
    packLabel,
    pricePer,
    dealerPaise: "paise" in dealer ? dealer.paise : null,
    distributorPaise: "paise" in distributor ? distributor.paise : null,
    gstPct,
    hsn: hsn || null,
    segment: segment as "Automotive" | "Industrial" | "Both",
    density,
  };
}

/**
 * Edit: checks the form and works out what actually changed. `changes` only holds
 * fields whose value differs from the product as it was when the form opened.
 */
export function readEditForm(
  values: ProductFormValues,
  product: Product,
): { changes: ProductChanges; errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};
  const v = readShared(values, errors);
  const changes: ProductChanges = {};
  if (!errors.name && v.name !== product.name) changes.product = v.name;
  if (!errors.packLabel && v.packLabel !== product.packLabel) changes.orderableUnit = v.packLabel;
  if (!errors.pricePer && v.pricePer !== product.pricePer) changes.pricePer = v.pricePer;
  if (!errors.dealerPrice && v.dealerPaise !== product.dealerPricePaise) changes.dealerPrice = v.dealerPaise;
  if (!errors.distributorPrice && v.distributorPaise !== product.distributorPricePaise) {
    changes.distributorPrice = v.distributorPaise;
  }
  if (!errors.gstPct && v.gstPct !== product.gstPct) changes.gstPct = v.gstPct;
  if (!errors.hsnCode && v.hsn !== product.hsnCode) changes.hsnCode = v.hsn;
  if (!errors.segment && v.segment !== product.segment) changes.segment = v.segment;
  if (!errors.density && v.density !== product.densityKgPerL) changes.densityKgPerL = v.density;
  if (values.active !== product.active) changes.active = values.active;
  return { changes, errors };
}

/** Add / copy: checks every field and builds the new product. */
export function readNewForm(values: ProductFormValues): { product: NewProduct | null; errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};
  const v = readShared(values, errors);

  const sku = values.sku.trim().toUpperCase();
  if (!/^[A-Z0-9]+(?:[-.][A-Z0-9]+)*$/.test(sku)) errors.sku = "Letters and numbers with dashes, e.g. HYDAW-68-26L.";

  const category = values.category;
  if (category !== "bulk_oil" && category !== "grease" && category !== "retail") errors.category = "Choose one.";

  const baseUnit = values.baseUnit;
  if (baseUnit !== "L" && baseUnit !== "kg" && baseUnit !== "piece") errors.baseUnit = "Choose one.";

  const packQty = Number(values.packQty.trim());
  if (!values.packQty.trim() || !Number.isFinite(packQty) || packQty <= 0) errors.packQty = "Enter a size above 0.";
  else if (Math.round(packQty * 1000) !== packQty * 1000) errors.packQty = "At most 3 decimals.";

  if (Object.keys(errors).length > 0) return { product: null, errors };
  return {
    errors,
    product: {
      sku,
      product: v.name,
      grade: clean(values.grade),
      category: category as NewProduct["category"],
      orderableUnit: v.packLabel,
      packQty,
      baseUnit: baseUnit as NewProduct["baseUnit"],
      pricePer: v.pricePer,
      dealerPrice: v.dealerPaise,
      distributorPrice: v.distributorPaise,
      gstPct: v.gstPct,
      hsnCode: v.hsn,
      segment: v.segment,
      densityKgPerL: v.density,
    },
  };
}

const GENERIC_WORDS = new Set(["OIL", "OILS", "GREASE", "FLUID", "THE", "AND"]);

/**
 * Suggests a SKU in the PRODUCTCODE-GRADE-PACK style, e.g. HYDAW-68-26L. A copy keeps the
 * original's product code when its SKU already follows the style.
 */
export function suggestSku(values: ProductFormValues, copiedFromSku?: string): string {
  const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let code = "";
  const fromCopy = copiedFromSku?.match(/^([A-Z0-9]+)-[A-Z0-9.]+-[A-Z0-9.]+$/);
  if (fromCopy?.[1]) {
    code = fromCopy[1];
  } else {
    const words = values.name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const [first = "", ...rest] = words;
    const second = rest.find((w) => !GENERIC_WORDS.has(w)) ?? "";
    code = alnum(first).slice(0, 3) + alnum(second).slice(0, 2);
  }

  const qty = Number(values.packQty);
  let pack = "";
  if (Number.isFinite(qty) && qty > 0) {
    if (values.baseUnit === "L") pack = qty < 1 ? `${Math.round(qty * 1000)}ML` : `${qty}L`;
    else if (values.baseUnit === "kg") pack = qty < 1 ? `${Math.round(qty * 1000)}G` : `${qty}KG`;
    else pack = `${qty}PC`;
  }
  return [code, alnum(values.grade), pack.replace(".", "P")].filter(Boolean).join("-");
}
