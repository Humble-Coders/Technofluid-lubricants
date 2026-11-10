/**
 * Sales & invoices — the shared rules (brief: docs/office/sales-brief.md).
 *
 * A sale bills one customer for whole packs at the price of the customer's price list
 * (Dealer / Distributor), less an optional per-line discount, plus GST on top: CGST +
 * SGST when the place of supply is Haryana (06), IGST otherwise. Freight, when charged,
 * is taxed at the goods' rate. The total is rounded to the rupee.
 *
 * Invoice numbers are our own financial-year series ("TF/2026-27/0001"), at most 16
 * characters (the GST limit), restarting every 1 April.
 *
 * Pure — no Firebase, no UI. Mirrored in firebase/functions/src/sales/saleModel.ts;
 * both run sale.cases.json so the two copies can't drift.
 */
import { checkGstin, invoiceTotals, isValidStateCode, type InvoiceTotals, type SupplyType } from "./gst";
import { percentOfPaise } from "./money";
import { packPricePaise, piecesPerPackFromLabel, priceBasisFromLabel } from "./pricing";
import { toMilli, type BaseUnit } from "./units";
import { WALK_IN_ENTITY_ID, type PriceTier } from "./entity";

export const MAX_SALE_LINES = 60;
export const MAX_PACKS_PER_LINE = 100_000;
/** Highest pack price an Admin may type for one sale: ₹10,00,000. */
export const MAX_MANUAL_PACK_PRICE_PAISE = 100_000_000;
/** At most two payment legs at billing (e.g. part cash, part bank). */
export const MAX_SALE_PAYMENTS = 2;
/** GST: an invoice number has at most 16 characters. */
export const MAX_INVOICE_NUMBER_LENGTH = 16;
export const DEFAULT_INVOICE_PREFIX = "TF";

/** What a sale needs to know about a product (a products doc plus its prices). */
export interface SaleProduct {
  sku: string;
  name: string;
  grade: string;
  packLabel: string;
  productKey: string;
  /** Base units in one pack, as a decimal (26 for a 26 L can). */
  packQty: number;
  baseUnit: BaseUnit;
  pricePer: string | null;
  dealerPricePaise: number | null;
  distributorPricePaise: number | null;
  /** 18 for 18 %. A placeholder until the CA confirms the real rates. */
  gstPct: number | null;
  hsnCode: string | null;
  active: boolean;
}

export interface SaleLineInput {
  sku: string;
  /** Whole packs ≥ 1. */
  packs: number;
  /** 0–10000 (5 % = 500). */
  discountBp: number;
  /**
   * A price for one pack typed by an Admin for THIS sale only — allowed only when the
   * product has no price for the customer's price list. Never saved on the product.
   */
  manualPackPricePaise?: number | null;
}

/** One billed line, everything worked out and frozen at the time of sale. */
export interface PricedSaleLine {
  sku: string;
  productName: string;
  packLabel: string;
  productKey: string;
  hsnCode: string | null;
  baseUnit: BaseUnit;
  packQtyMilli: number;
  packs: number;
  /** Base units sold (packs × pack size) — what leaves stock. */
  qtyMilli: number;
  pricePer: string;
  /** The list price as the master quotes it (per litre / per case …), for the price list used. */
  listPricePaise: number;
  /** Price of one pack. */
  packPricePaise: number;
  /** True when an Admin typed the pack price for this sale (the product had no price). */
  manualPrice: boolean;
  discountBp: number;
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface SaleFreight {
  taxablePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface SaleTotals {
  supplyType: SupplyType;
  /** Before discount. */
  grossPaise: number;
  discountPaise: number;
  /** Goods after discount + freight. */
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  exactTotalPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
  byRate: InvoiceTotals["byRate"];
}

export type SaleLineErrorCode =
  | "UNKNOWN_PRODUCT"
  | "PRODUCT_INACTIVE"
  | "NO_PRICE"
  | "NO_PRICE_BASIS"
  | "BAD_PACK_SIZE"
  | "BAD_PACKS"
  | "BAD_DISCOUNT"
  | "BAD_GST_RATE"
  | "MANUAL_PRICE_NOT_ALLOWED"
  | "BAD_MANUAL_PRICE";

export const SALE_LINE_ERROR_TEXT: Record<SaleLineErrorCode, string> = {
  UNKNOWN_PRODUCT: "This product doesn't exist any more.",
  PRODUCT_INACTIVE: "This product is hidden from sales.",
  NO_PRICE: "This product has no price for the customer's price list yet.",
  NO_PRICE_BASIS: "This product's price has no \"per\" (per litre / per case …) — an Admin must set it.",
  BAD_PACK_SIZE: "This product's pack size isn't set properly — an Admin must fix it.",
  BAD_PACKS: `Packs must be a whole number from 1 to ${MAX_PACKS_PER_LINE.toLocaleString("en-IN")}.`,
  BAD_DISCOUNT: "Discount must be between 0 and 100 %, at most two decimals.",
  BAD_GST_RATE: "This product's GST rate isn't usable — an Admin must fix it.",
  MANUAL_PRICE_NOT_ALLOWED: "This product already has a price for this price list — use a discount instead.",
  BAD_MANUAL_PRICE: `The price for one pack must be from ₹0.01 to ₹${(MAX_MANUAL_PACK_PRICE_PAISE / 100).toLocaleString("en-IN")}.`,
};

/** 18 → 1800 basis points; null if it isn't a rate GST can split in half (CGST + SGST). */
export function gstRateBp(gstPct: number | null | undefined): number | null {
  if (typeof gstPct !== "number" || !Number.isFinite(gstPct) || gstPct < 0 || gstPct > 100) return null;
  const bp = Math.round(gstPct * 100);
  if (Math.abs(bp - gstPct * 100) > 1e-6 || bp % 2 !== 0) return null;
  return bp;
}

/** The product's list price for a price list (per its "Price per"), or null if unset. */
export const tierPrice = (p: SaleProduct, tier: PriceTier): number | null =>
  tier === "Distributor" ? p.distributorPricePaise : p.dealerPricePaise;

type Pre = Omit<PricedSaleLine, "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise">;

/** Prices one line before tax. */
function preLine(p: SaleProduct | undefined, line: SaleLineInput, tier: PriceTier): { ok: true; line: Pre } | { ok: false; code: SaleLineErrorCode } {
  if (!p) return { ok: false, code: "UNKNOWN_PRODUCT" };
  if (!p.active) return { ok: false, code: "PRODUCT_INACTIVE" };
  if (!Number.isInteger(line.packs) || line.packs < 1 || line.packs > MAX_PACKS_PER_LINE) return { ok: false, code: "BAD_PACKS" };
  if (!Number.isInteger(line.discountBp) || line.discountBp < 0 || line.discountBp > 10_000) return { ok: false, code: "BAD_DISCOUNT" };
  const list = tierPrice(p, tier);
  const hasList = list !== null && Number.isInteger(list) && list >= 0;
  // An Admin may type a pack price for this one sale, only when there is no list price.
  const manual = line.manualPackPricePaise ?? null;
  if (manual !== null) {
    if (hasList) return { ok: false, code: "MANUAL_PRICE_NOT_ALLOWED" };
    if (!Number.isInteger(manual) || manual < 1 || manual > MAX_MANUAL_PACK_PRICE_PAISE) return { ok: false, code: "BAD_MANUAL_PRICE" };
  } else {
    if (!hasList) return { ok: false, code: "NO_PRICE" };
    if (!p.pricePer) return { ok: false, code: "NO_PRICE_BASIS" };
  }
  const rate = gstRateBp(p.gstPct);
  if (rate === null) return { ok: false, code: "BAD_GST_RATE" };
  if (!Number.isFinite(p.packQty) || p.packQty <= 0) return { ok: false, code: "BAD_PACK_SIZE" };
  const packQtyMilli = toMilli(p.packQty);
  let packPrice: number;
  let pricePer: string;
  let listPrice: number;
  if (manual !== null) {
    packPrice = manual;
    pricePer = "per pack";
    listPrice = manual;
  } else {
    let basis;
    try {
      basis = priceBasisFromLabel(p.pricePer as string);
    } catch {
      return { ok: false, code: "NO_PRICE_BASIS" };
    }
    try {
      packPrice = packPricePaise({ basis, pricePaise: list as number, packQtyMilli, piecesPerPack: piecesPerPackFromLabel(p.packLabel) ?? undefined });
    } catch {
      return { ok: false, code: "BAD_PACK_SIZE" };
    }
    pricePer = p.pricePer as string;
    listPrice = list as number;
  }
  const grossPaise = packPrice * line.packs;
  const discountPaise = percentOfPaise(grossPaise, line.discountBp);
  return {
    ok: true,
    line: {
      sku: p.sku,
      productName: [p.name, p.grade].filter((x) => x && x.trim()).join(" "),
      packLabel: p.packLabel,
      productKey: p.productKey,
      hsnCode: p.hsnCode && p.hsnCode.trim() ? p.hsnCode.trim() : null,
      baseUnit: p.baseUnit,
      packQtyMilli,
      packs: line.packs,
      qtyMilli: packQtyMilli * line.packs,
      pricePer,
      listPricePaise: listPrice,
      packPricePaise: packPrice,
      manualPrice: manual !== null,
      discountBp: line.discountBp,
      grossPaise,
      discountPaise,
      taxablePaise: grossPaise - discountPaise,
      gstRateBp: rate,
    },
  };
}

export interface PriceSaleInput {
  products: Readonly<Record<string, SaleProduct>>;
  lines: readonly SaleLineInput[];
  tier: PriceTier;
  sellerStateCode: string;
  placeOfSupplyStateCode: string;
  /** Freight charged to the customer, before GST (0 = none). */
  freightPaise: number;
}

export type PricedSale =
  | {
      ok: true;
      lines: PricedSaleLine[];
      freight: SaleFreight | null;
      totals: SaleTotals;
      /** SKUs billed without an HSN code (allowed, with a warning, until the CA sends them). */
      missingHsn: string[];
    }
  | { ok: false; errors: { line: number; code: SaleLineErrorCode }[] };

/**
 * Prices a whole sale: every line, freight (taxed at the highest goods rate — freight
 * charged on the invoice is part of the supply), CGST/SGST or IGST, round-off.
 * Header checks (state, freight amount, lines present) are saleError's job.
 */
export function priceSale(input: PriceSaleInput): PricedSale {
  const pre: Pre[] = [];
  const errors: { line: number; code: SaleLineErrorCode }[] = [];
  input.lines.forEach((l, i) => {
    const r = preLine(input.products[l.sku], l, input.tier);
    if (r.ok) pre.push(r.line);
    else errors.push({ line: i, code: r.code });
  });
  if (errors.length > 0) return { ok: false, errors };

  const freightRate = pre.reduce((max, l) => Math.max(max, l.gstRateBp), 0);
  const taxable = pre.map((l) => ({ taxablePaise: l.taxablePaise, gstRateBp: l.gstRateBp }));
  if (input.freightPaise > 0) taxable.push({ taxablePaise: input.freightPaise, gstRateBp: freightRate });
  const t = invoiceTotals(taxable, input.sellerStateCode, input.placeOfSupplyStateCode);

  const lines: PricedSaleLine[] = pre.map((l, i) => {
    const x = t.lines[i]!;
    return { ...l, cgstPaise: x.cgstPaise, sgstPaise: x.sgstPaise, igstPaise: x.igstPaise, totalPaise: x.totalPaise };
  });
  const f = input.freightPaise > 0 ? t.lines[pre.length]! : null;
  const grossPaise = pre.reduce((s, l) => s + l.grossPaise, 0);
  const discountPaise = pre.reduce((s, l) => s + l.discountPaise, 0);
  return {
    ok: true,
    lines,
    freight: f
      ? { taxablePaise: f.taxablePaise, gstRateBp: f.gstRateBp, cgstPaise: f.cgstPaise, sgstPaise: f.sgstPaise, igstPaise: f.igstPaise, totalPaise: f.totalPaise }
      : null,
    totals: {
      supplyType: t.supplyType,
      grossPaise,
      discountPaise,
      taxablePaise: t.taxablePaise,
      cgstPaise: t.cgstPaise,
      sgstPaise: t.sgstPaise,
      igstPaise: t.igstPaise,
      taxPaise: t.taxPaise,
      exactTotalPaise: t.exactTotalPaise,
      roundOffPaise: t.roundOffPaise,
      grandTotalPaise: t.grandTotalPaise,
      byRate: t.byRate,
    },
    missingHsn: [...new Set(lines.filter((l) => !l.hsnCode).map((l) => l.sku))],
  };
}

// ─── The sale as a whole ────────────────────────────────────────────────────────

export interface SalePaymentInput {
  registerId: string;
  amountPaise: number;
}

export interface SaleHeaderInput {
  customerEntityId: string;
  /** The customer's price list; null = not chosen yet (can't bill). */
  priceTier: PriceTier | null;
  placeOfSupplyStateCode: string | null;
  invoiceDate: string;
  lineCount: number;
  freightPaise: number;
  payments: readonly SalePaymentInput[];
  note: string | null;
}

export type SaleErrorCode =
  | "NO_LINES"
  | "TOO_MANY_LINES"
  | "NO_PRICE_TIER"
  | "NO_STATE"
  | "BAD_FREIGHT"
  | "BAD_DATE"
  | "FUTURE_DATE"
  | "TOO_MANY_PAYMENTS"
  | "BAD_PAYMENT"
  | "SAME_REGISTER_TWICE"
  | "NOTE_TOO_LONG";

export const SALE_ERROR_TEXT: Record<SaleErrorCode, string> = {
  NO_LINES: "Add at least one product.",
  TOO_MANY_LINES: `At most ${MAX_SALE_LINES} lines on one invoice.`,
  NO_PRICE_TIER: "Choose the customer's price list (Dealer or Distributor) on their record first.",
  NO_STATE: "The customer has no state on record — needed for GST. Add it on their record first.",
  BAD_FREIGHT: "Freight must be ₹0 or more.",
  BAD_DATE: "Invoice date must look like 2026-10-27.",
  FUTURE_DATE: "An invoice can't be dated in the future.",
  TOO_MANY_PAYMENTS: `At most ${MAX_SALE_PAYMENTS} payments at billing.`,
  BAD_PAYMENT: "Each payment must be more than ₹0, into a cash or bank account.",
  SAME_REGISTER_TWICE: "Two payments into the same account — put them together.",
  NOTE_TOO_LONG: "Keep the note under 300 characters.",
};

const realDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** The first problem with a sale's header, or null. Line problems are priceSale's. */
export function saleError(s: SaleHeaderInput, today: string): SaleErrorCode | null {
  if (s.lineCount < 1) return "NO_LINES";
  if (s.lineCount > MAX_SALE_LINES) return "TOO_MANY_LINES";
  if (s.priceTier !== "Dealer" && s.priceTier !== "Distributor") return "NO_PRICE_TIER";
  if (!s.placeOfSupplyStateCode || !isValidStateCode(s.placeOfSupplyStateCode)) return "NO_STATE";
  if (!Number.isInteger(s.freightPaise) || s.freightPaise < 0) return "BAD_FREIGHT";
  if (typeof s.invoiceDate !== "string" || !realDay(s.invoiceDate)) return "BAD_DATE";
  if (s.invoiceDate > today) return "FUTURE_DATE";
  if (s.payments.length > MAX_SALE_PAYMENTS) return "TOO_MANY_PAYMENTS";
  for (const p of s.payments) {
    if (!p.registerId || !Number.isInteger(p.amountPaise) || p.amountPaise <= 0) return "BAD_PAYMENT";
  }
  if (new Set(s.payments.map((p) => p.registerId)).size !== s.payments.length) return "SAME_REGISTER_TWICE";
  if (s.note && s.note.length > 300) return "NOTE_TOO_LONG";
  return null;
}

export type SalePaymentErrorCode = "PAYMENT_TOO_MUCH" | "WALK_IN_MUST_PAY_FULL";

export const SALE_PAYMENT_ERROR_TEXT: Record<SalePaymentErrorCode, string> = {
  PAYMENT_TOO_MUCH: "Paid now is more than the invoice total — record the extra separately as money received.",
  WALK_IN_MUST_PAY_FULL: "A walk-in customer must pay the full amount now.",
};

/** Paid-at-billing against the invoice total. A walk-in pays in full; nobody pays more than the total. */
export function salePaymentError(customerEntityId: string, grandTotalPaise: number, payments: readonly SalePaymentInput[]): SalePaymentErrorCode | null {
  const paid = payments.reduce((s, p) => s + p.amountPaise, 0);
  if (paid > grandTotalPaise) return "PAYMENT_TOO_MUCH";
  if (customerEntityId === WALK_IN_ENTITY_ID && paid !== grandTotalPaise) return "WALK_IN_MUST_PAY_FULL";
  return null;
}

// ─── Dispatch details ──────────────────────────────────────────────────────────

/** How the goods leave — printed on the invoice. All optional. */
export interface SaleDispatch {
  transport: string | null;
  vehicleNo: string | null;
  station: string | null;
  ewayBillNo: string | null;
}

/**
 * Where the goods go when it isn't the billing address. GST is unchanged: for a registered
 * "bill to one, ship to another" sale the place of supply is the billed-to state (IGST Act
 * s.10(1)(b)). Not allowed on a walk-in sale: there the place of supply is where the goods
 * go (s.10(1)(a)), which we don't price yet (pending CA sign-off).
 */
export interface SaleShipTo {
  name: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  stateCode: string;
  gstin: string | null;
}

export type DispatchErrorCode = "TRANSPORT_TOO_LONG" | "BAD_VEHICLE_NO" | "STATION_TOO_LONG" | "BAD_EWAY_BILL" | "SHIP_TO_NO_NAME" | "SHIP_TO_TOO_LONG" | "SHIP_TO_NO_STATE" | "SHIP_TO_BAD_PIN" | "SHIP_TO_BAD_GSTIN" | "SHIP_TO_GSTIN_STATE" | "SHIP_TO_WALK_IN";

export const DISPATCH_ERROR_TEXT: Record<DispatchErrorCode, string> = {
  TRANSPORT_TOO_LONG: "Keep the transport name under 60 characters.",
  BAD_VEHICLE_NO: "The vehicle number should be letters and digits, like HR99X0001.",
  STATION_TOO_LONG: "Keep the station under 40 characters.",
  BAD_EWAY_BILL: "An e-way bill number is 12 digits.",
  SHIP_TO_NO_NAME: "Give the name of who the goods are shipped to.",
  SHIP_TO_TOO_LONG: "Keep the ship-to name under 120 and the address under 200 characters.",
  SHIP_TO_NO_STATE: "Choose the state the goods are shipped to.",
  SHIP_TO_BAD_PIN: "The ship-to PIN code should be 6 digits.",
  SHIP_TO_BAD_GSTIN: "The ship-to GSTIN isn't valid.",
  SHIP_TO_GSTIN_STATE: "The ship-to GSTIN is from a different state than the ship-to state.",
  SHIP_TO_WALK_IN: "A walk-in sale can't be shipped to another address. Bill it to a saved customer instead.",
};

const tidy = (v: unknown, upper = false): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? (upper ? t.toUpperCase() : t) : null;
};

/** Empty parts become null; null when nothing was given. Vehicle and e-way numbers lose their spaces. */
export function cleanDispatch(d: Partial<Record<keyof SaleDispatch, unknown>> | null | undefined): SaleDispatch | null {
  if (!d) return null;
  const out: SaleDispatch = {
    transport: tidy(d.transport),
    vehicleNo: tidy(d.vehicleNo, true)?.replace(/[\s-]/g, "") || null,
    station: tidy(d.station),
    ewayBillNo: tidy(d.ewayBillNo)?.replace(/\s/g, "") || null,
  };
  return Object.values(out).some(Boolean) ? out : null;
}

/** null when no ship-to name, address or state was given (= ship to the billing address). */
export function cleanShipTo(t: Partial<Record<keyof SaleShipTo, unknown>> | null | undefined): SaleShipTo | null {
  if (!t) return null;
  const out = { name: tidy(t.name) ?? "", address: tidy(t.address), city: tidy(t.city), pincode: tidy(t.pincode), stateCode: tidy(t.stateCode) ?? "", gstin: tidy(t.gstin, true)?.replace(/\s/g, "") || null };
  return out.name || out.address || out.city || out.gstin ? out : null;
}

/** The first problem with the dispatch details (already cleaned), or null. */
export function dispatchError(d: SaleDispatch | null, t: SaleShipTo | null, isWalkIn = false): DispatchErrorCode | null {
  if (d?.transport && d.transport.length > 60) return "TRANSPORT_TOO_LONG";
  if (d?.vehicleNo && !/^[A-Z0-9]{4,15}$/.test(d.vehicleNo)) return "BAD_VEHICLE_NO";
  if (d?.station && d.station.length > 40) return "STATION_TOO_LONG";
  if (d?.ewayBillNo && !/^\d{12}$/.test(d.ewayBillNo)) return "BAD_EWAY_BILL";
  if (t) {
    if (isWalkIn) return "SHIP_TO_WALK_IN";
    if (!t.name) return "SHIP_TO_NO_NAME";
    if (t.name.length > 120 || (t.address && t.address.length > 200) || (t.city && t.city.length > 60)) return "SHIP_TO_TOO_LONG";
    if (!t.stateCode || !isValidStateCode(t.stateCode)) return "SHIP_TO_NO_STATE";
    if (t.pincode && !/^\d{6}$/.test(t.pincode)) return "SHIP_TO_BAD_PIN";
    if (t.gstin && !checkGstin(t.gstin).valid) return "SHIP_TO_BAD_GSTIN";
    if (t.gstin && t.gstin.slice(0, 2) !== t.stateCode) return "SHIP_TO_GSTIN_STATE";
  }
  return null;
}

// ─── Walk-in buyer ─────────────────────────────────────────────────────────────

/** Who bought, for a walk-in / cash sale — printed on that invoice only. */
export interface WalkInBuyer {
  name: string | null;
  phone: string | null;
  address: string | null;
}

/**
 * From this taxable value up, a walk-in invoice must name the buyer and their address
 * (GST rule 46: a supply of ₹50,000 or more to an unregistered buyer).
 */
export const WALK_IN_BUYER_NEEDED_FROM_PAISE = 5_000_000;

export type WalkInBuyerErrorCode = "BUYER_NOT_WALK_IN" | "BUYER_NAME_TOO_LONG" | "BUYER_BAD_PHONE" | "BUYER_ADDRESS_TOO_LONG" | "BUYER_NEEDED";

export const WALK_IN_BUYER_ERROR_TEXT: Record<WalkInBuyerErrorCode, string> = {
  BUYER_NOT_WALK_IN: "Buyer details are only for a walk-in customer.",
  BUYER_NAME_TOO_LONG: "Keep the buyer's name under 100 characters.",
  BUYER_BAD_PHONE: "The buyer's phone should be 6–15 digits.",
  BUYER_ADDRESS_TOO_LONG: "Keep the buyer's address under 200 characters.",
  BUYER_NEEDED: "For a bill of ₹50,000 or more (before GST), give the buyer's name and address.",
};

const blank = (v: string | null | undefined) => !v || !v.trim();

/** Empty fields become null; null when nothing was given. */
export function cleanWalkInBuyer(b: Partial<WalkInBuyer> | null | undefined): WalkInBuyer | null {
  if (!b) return null;
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null);
  const out = { name: t(b.name), phone: t(b.phone), address: t(b.address) };
  return out.name || out.phone || out.address ? out : null;
}

/** The first problem with a walk-in's buyer details (already cleaned), or null. */
export function walkInBuyerError(isWalkIn: boolean, buyer: WalkInBuyer | null, taxablePaise: number): WalkInBuyerErrorCode | null {
  if (!isWalkIn) return buyer ? "BUYER_NOT_WALK_IN" : null;
  if (buyer?.name && buyer.name.length > 100) return "BUYER_NAME_TOO_LONG";
  if (buyer?.phone && !/^\+?\d{6,15}$/.test(buyer.phone.replace(/[\s-]/g, ""))) return "BUYER_BAD_PHONE";
  if (buyer?.address && buyer.address.length > 200) return "BUYER_ADDRESS_TOO_LONG";
  if (taxablePaise >= WALK_IN_BUYER_NEEDED_FROM_PAISE && (blank(buyer?.name) || blank(buyer?.address))) return "BUYER_NEEDED";
  return null;
}

// ─── Invoice numbers ───────────────────────────────────────────────────────────

/** Indian financial year of a date: 2026-10-27 → "2026-27"; 2027-03-31 → "2026-27". */
export function financialYear(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** 1–3 capital letters or digits ("TF"); keeps the number within 16 characters. */
export const validInvoicePrefix = (p: string) => /^[A-Z0-9]{1,3}$/.test(p);

/** "TF/2026-27/0001". Throws if the number would break GST's 16-character limit. */
export function invoiceNumber(prefix: string, fy: string, seq: number): string {
  if (!validInvoicePrefix(prefix)) throw new RangeError(`Bad invoice prefix "${prefix}"`);
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Bad invoice sequence ${seq}`);
  const n = `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
  if (n.length > MAX_INVOICE_NUMBER_LENGTH) throw new RangeError(`Invoice number ${n} is longer than ${MAX_INVOICE_NUMBER_LENGTH} characters`);
  return n;
}

// ─── Paid or not ───────────────────────────────────────────────────────────────

export type PaidState = "UNPAID" | "PART_PAID" | "PAID";

/** From what has been paid against the invoice (at billing + payments linked to it). */
export function paidState(grandTotalPaise: number, paidPaise: number): PaidState {
  if (paidPaise <= 0) return grandTotalPaise === 0 ? "PAID" : "UNPAID";
  return paidPaise >= grandTotalPaise ? "PAID" : "PART_PAID";
}

// ─── The seller ────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  legalName: string;
  tradeName: string | null;
  gstin: string;
  stateCode: string;
  address: { line1: string; line2: string; city: string; pincode: string };
  phone: string | null;
  email: string | null;
  invoicePrefix: string;
  /** Printed in "Bank Details" on the invoice (optional). */
  bank?: CompanyBank | null;
  /** Terms & conditions printed on the invoice, one per line (optional). */
  invoiceTerms?: string[] | null;
}

export interface CompanyBank {
  name: string;
  branch: string;
  accountType: string;
  accountNo: string;
  ifsc: string;
}

export type CompanyErrorCode = "NO_NAME" | "BAD_GSTIN" | "NO_ADDRESS" | "BAD_PINCODE" | "BAD_PREFIX";

export const COMPANY_ERROR_TEXT: Record<CompanyErrorCode, string> = {
  NO_NAME: "Give the company's legal name.",
  BAD_GSTIN: "The company's GSTIN isn't valid.",
  NO_ADDRESS: "Give the address (line 1 and city).",
  BAD_PINCODE: "PIN code must be 6 digits.",
  BAD_PREFIX: "Invoice prefix must be 1–3 capital letters or digits (e.g. TF).",
};

/** Everything an invoice must say about the seller. null = good to bill. */
export function companyError(c: Omit<CompanyProfile, "stateCode">): CompanyErrorCode | null {
  if (!c.legalName || !c.legalName.trim()) return "NO_NAME";
  if (!c.gstin || !checkGstin(c.gstin).valid) return "BAD_GSTIN";
  if (!c.address?.line1?.trim() || !c.address?.city?.trim()) return "NO_ADDRESS";
  if (c.address.pincode && !/^\d{6}$/.test(c.address.pincode)) return "BAD_PINCODE";
  if (!validInvoicePrefix(c.invoicePrefix)) return "BAD_PREFIX";
  return null;
}

// ─── Amount in words (Indian system), for the invoice ──────────────────────────

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n]!;
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

/** Whole number in Indian words: 1,23,45,678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight". */
function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  return [
    crore ? `${indianWords(crore)} Crore` : "",
    lakh ? `${below100(lakh)} Lakh` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    rest ? below1000(rest) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 12345678 paise → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only". */
export function amountInWords(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new RangeError(`Bad amount ${paise}`);
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${indianWords(rupees)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}
