/**
 * Purchases — the shared rules (brief: docs/office/purchases-brief.md).
 *
 * A purchase records a supplier's bill: raw materials, consumables (cans, caps, cartons,
 * labels) or bought-in finished goods. The supplier's bill is the source of truth:
 * each line is typed as quantity + value before GST + GST rate, GST is worked out per
 * line (CGST + SGST when the supplier is in Haryana, IGST otherwise), freight is taxed
 * at the highest line rate (as on sales), and a round-off of at most ±₹1 makes our
 * total match the total printed on the bill. A supplier with no GSTIN can't charge
 * GST: no GST on the bill, no input GST in the books.
 *
 * Our own reference ("PB/2026-27/0001") is for finding a bill — not a legal number.
 *
 * Pure — no Firebase, no UI. Mirrored in firebase/functions/src/purchases/purchaseModel.ts;
 * both run purchase.cases.json so the two copies can't drift.
 */
import { checkGstin, invoiceTotals, type InvoiceTotals } from "./gst";
import { roundOffToRupee } from "./money";
import { financialYear } from "./sale";
import type { BaseUnit } from "./units";

export const MAX_PURCHASE_LINES = 60;
/** At most two payments with the bill (e.g. part cash, part bank). */
export const MAX_PURCHASE_PAYMENTS = 2;
/** The round-off may move the total by at most ₹1 either way. */
export const MAX_ROUND_OFF_PAISE = 100;
/** Largest quantity on one line: 10 million base units (as the stock journal). */
export const MAX_PURCHASE_QTY_MILLI = 10_000_000_000;
/** Largest value on one line: ₹10 crore. */
export const MAX_LINE_TAXABLE_PAISE = 10_000_000_000;
export const MAX_BILL_NO_LENGTH = 40;
export const MAX_PURCHASE_NOTE_LENGTH = 300;
export const PURCHASE_REF_PREFIX = "PB";

/** Stock-item kinds that can be bought. Premixes and blends are made, never bought. */
export const BUYABLE_KINDS: readonly string[] = ["raw_material", "consumable", "product_pool"];

/** What a purchase needs to know about a stock item. */
export interface PurchaseItem {
  id: string;
  name: string;
  kind: string;
  /** null = the item has no unit yet (can't be counted, so can't be bought). */
  baseUnit: BaseUnit | null;
}

export interface PurchaseLineInput {
  itemId: string;
  /** Whole milli base units (mL / g / milli-pieces), above 0. */
  qtyMilli: number;
  /** Value before GST, in paise (0 allowed: a free sample still comes into stock). */
  taxablePaise: number;
  /** 18 % = 1800; even, so it splits into CGST + SGST. */
  gstRateBp: number;
}

export interface PricedPurchaseLine {
  itemId: string;
  itemName: string;
  itemKind: string;
  baseUnit: BaseUnit;
  qtyMilli: number;
  taxablePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  /** Cost of one base unit before GST (₹/L, ₹/kg, ₹/piece), in paise — recorded for later costing. */
  unitCostPaise: number;
}

export interface PurchaseFreight {
  taxablePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/** INTRA = CGST + SGST, INTER = IGST, NONE = an unregistered supplier (no GST). */
export type PurchaseSupplyType = "INTRA" | "INTER" | "NONE";

export interface PurchaseTotals {
  supplyType: PurchaseSupplyType;
  /** Goods + freight, before GST. */
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  /** taxable + GST, before the round-off. */
  exactTotalPaise: number;
  roundOffPaise: number;
  /** exact total + round-off — must equal the supplier's printed total. */
  billTotalPaise: number;
  /**
   * What goes into the inventory account: taxable (goods + freight) + round-off. The
   * books then read DR inventory subtotal + DR input GST = CR supplier bill total.
   */
  subtotalPaise: number;
  byRate: InvoiceTotals["byRate"];
}

export type PurchaseLineErrorCode = "UNKNOWN_ITEM" | "NOT_BUYABLE" | "NO_UNIT" | "BAD_QTY" | "BAD_TAXABLE" | "BAD_GST_RATE";

export const PURCHASE_LINE_ERROR_TEXT: Record<PurchaseLineErrorCode, string> = {
  UNKNOWN_ITEM: "This stock item doesn't exist any more.",
  NOT_BUYABLE: "Premixes and blends are made in the factory, not bought — choose a raw material, consumable or product.",
  NO_UNIT: "This item has no unit yet — an Admin must set it on the Stock screen first.",
  BAD_QTY: "Quantity must be more than 0, with at most 3 decimals.",
  BAD_TAXABLE: "The value before GST must be ₹0 or more (at most ₹10 crore a line).",
  BAD_GST_RATE: "GST % must be a rate like 0, 5, 12, 18 or 28.",
};

/** A usable GST rate in basis points: whole, even (splits into CGST + SGST), 0–100 %. */
export const validGstRateBp = (bp: unknown): bp is number =>
  typeof bp === "number" && Number.isInteger(bp) && bp >= 0 && bp <= 10_000 && bp % 2 === 0;

/** The supplier's state for GST, from a valid GSTIN; null = unregistered (no GST). */
export function supplierGstState(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const c = checkGstin(gstin);
  return c.valid ? c.stateCode : null;
}

/** Paise per base unit (₹/L …) from a line's value and milli quantity, rounded to the paisa. */
export function unitCostPaise(taxablePaise: number, qtyMilli: number): number {
  if (qtyMilli <= 0) return 0;
  return Math.round((taxablePaise * 1000) / qtyMilli);
}

export interface PricePurchaseInput {
  items: Readonly<Record<string, PurchaseItem>>;
  lines: readonly PurchaseLineInput[];
  /** Freight on the bill, before GST (0 = none). */
  freightPaise: number;
  /** The supplier's GST state (from their GSTIN); null = unregistered → no GST. */
  supplierStateCode: string | null;
  sellerStateCode: string;
  roundOffPaise: number;
}

export type PricedPurchase =
  | { ok: true; lines: PricedPurchaseLine[]; freight: PurchaseFreight | null; totals: PurchaseTotals }
  | { ok: false; errors: { line: number; code: PurchaseLineErrorCode }[] };

function lineError(item: PurchaseItem | undefined, l: PurchaseLineInput): PurchaseLineErrorCode | null {
  if (!item) return "UNKNOWN_ITEM";
  if (!BUYABLE_KINDS.includes(item.kind)) return "NOT_BUYABLE";
  if (!item.baseUnit) return "NO_UNIT";
  if (!Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0 || l.qtyMilli > MAX_PURCHASE_QTY_MILLI) return "BAD_QTY";
  if (!Number.isInteger(l.taxablePaise) || l.taxablePaise < 0 || l.taxablePaise > MAX_LINE_TAXABLE_PAISE) return "BAD_TAXABLE";
  if (!validGstRateBp(l.gstRateBp)) return "BAD_GST_RATE";
  return null;
}

/**
 * Works out a bill: each line's GST, freight (taxed at the highest line rate), totals
 * by rate, and the bill total after the round-off. No rounding to the rupee here — the
 * round-off is the user's field, checked by purchaseTotalsError. An unregistered
 * supplier's bill carries no GST at all (purchaseError refuses a GST rate on one).
 * Header checks (supplier, bill no, date, freight amount, payments) are purchaseError's.
 */
export function pricePurchase(input: PricePurchaseInput): PricedPurchase {
  const errors: { line: number; code: PurchaseLineErrorCode }[] = [];
  input.lines.forEach((l, i) => {
    const code = lineError(input.items[l.itemId], l);
    if (code) errors.push({ line: i, code });
  });
  if (errors.length > 0) return { ok: false, errors };

  const registered = input.supplierStateCode !== null;
  const rate = (bp: number) => (registered ? bp : 0);
  const freightRate = input.lines.reduce((max, l) => Math.max(max, rate(l.gstRateBp)), 0);
  const taxable = input.lines.map((l) => ({ taxablePaise: l.taxablePaise, gstRateBp: rate(l.gstRateBp) }));
  if (input.freightPaise > 0) taxable.push({ taxablePaise: input.freightPaise, gstRateBp: freightRate });
  // An unregistered supplier is priced as intra-state at 0 % — every GST figure is 0.
  const t = invoiceTotals(taxable, input.sellerStateCode, input.supplierStateCode ?? input.sellerStateCode, { roundToRupee: false });

  const lines: PricedPurchaseLine[] = input.lines.map((l, i) => {
    const item = input.items[l.itemId]!;
    const x = t.lines[i]!;
    return {
      itemId: item.id,
      itemName: item.name,
      itemKind: item.kind,
      baseUnit: item.baseUnit as BaseUnit,
      qtyMilli: l.qtyMilli,
      taxablePaise: l.taxablePaise,
      gstRateBp: x.gstRateBp,
      cgstPaise: x.cgstPaise,
      sgstPaise: x.sgstPaise,
      igstPaise: x.igstPaise,
      totalPaise: x.totalPaise,
      unitCostPaise: unitCostPaise(l.taxablePaise, l.qtyMilli),
    };
  });
  const f = input.freightPaise > 0 ? t.lines[input.lines.length]! : null;
  const roundOff = input.roundOffPaise;
  return {
    ok: true,
    lines,
    freight: f
      ? { taxablePaise: f.taxablePaise, gstRateBp: f.gstRateBp, cgstPaise: f.cgstPaise, sgstPaise: f.sgstPaise, igstPaise: f.igstPaise, totalPaise: f.totalPaise }
      : null,
    totals: {
      supplyType: !registered ? "NONE" : t.supplyType === "INTRA_STATE" ? "INTRA" : "INTER",
      taxablePaise: t.taxablePaise,
      cgstPaise: t.cgstPaise,
      sgstPaise: t.sgstPaise,
      igstPaise: t.igstPaise,
      taxPaise: t.taxPaise,
      exactTotalPaise: t.exactTotalPaise,
      roundOffPaise: roundOff,
      billTotalPaise: t.exactTotalPaise + roundOff,
      subtotalPaise: t.taxablePaise + roundOff,
      byRate: t.byRate,
    },
  };
}

/** The round-off that brings an exact total to the nearest rupee — the form's suggestion. */
export const suggestRoundOff = (exactTotalPaise: number): number => roundOffToRupee(exactTotalPaise).roundOff;

// ─── The bill as a whole ───────────────────────────────────────────────────────

export interface PurchasePaymentInput {
  registerId: string;
  amountPaise: number;
}

export interface PurchaseHeaderInput {
  supplierEntityId: string;
  billNo: string;
  billDate: string;
  lineCount: number;
  /** Every line's GST rate (to refuse GST from a supplier with no GSTIN). */
  lineRatesBp: readonly number[];
  /** The supplier's GSTIN on our record; null = unregistered. */
  supplierGstin: string | null;
  freightPaise: number;
  roundOffPaise: number;
  payments: readonly PurchasePaymentInput[];
  note: string | null;
}

export type PurchaseErrorCode =
  | "NO_LINES"
  | "TOO_MANY_LINES"
  | "NO_SUPPLIER"
  | "NO_BILL_NO"
  | "BILL_NO_TOO_LONG"
  | "BAD_DATE"
  | "FUTURE_DATE"
  | "BAD_FREIGHT"
  | "BAD_ROUND_OFF"
  | "GST_WITHOUT_GSTIN"
  | "TOO_MANY_PAYMENTS"
  | "BAD_PAYMENT"
  | "SAME_REGISTER_TWICE"
  | "NOTE_TOO_LONG"
  | "ZERO_BILL"
  | "TOTAL_MISMATCH"
  | "PAYMENT_TOO_MUCH";

export const PURCHASE_ERROR_TEXT: Record<PurchaseErrorCode, string> = {
  NO_LINES: "Add at least one item.",
  TOO_MANY_LINES: `At most ${MAX_PURCHASE_LINES} lines on one bill.`,
  NO_SUPPLIER: "Choose the supplier.",
  NO_BILL_NO: "Type the supplier's bill number.",
  BILL_NO_TOO_LONG: `Keep the bill number under ${MAX_BILL_NO_LENGTH} characters.`,
  BAD_DATE: "Bill date must look like 2026-11-13.",
  FUTURE_DATE: "A bill can't be dated in the future.",
  BAD_FREIGHT: "Freight must be ₹0 or more.",
  BAD_ROUND_OFF: "Round-off can be at most ₹1.00 either way.",
  GST_WITHOUT_GSTIN: "This supplier has no GSTIN on record, so the bill can't carry GST — set GST to 0 %, or add their GSTIN first.",
  TOO_MANY_PAYMENTS: `At most ${MAX_PURCHASE_PAYMENTS} payments with the bill.`,
  BAD_PAYMENT: "Each payment must be more than ₹0, from a cash or bank account.",
  SAME_REGISTER_TWICE: "Two payments from the same account — put them together.",
  NOTE_TOO_LONG: `Keep the note under ${MAX_PURCHASE_NOTE_LENGTH} characters.`,
  ZERO_BILL: "The bill comes to ₹0 — there's nothing to record.",
  TOTAL_MISMATCH: "Our total doesn't match the supplier's bill total — check the lines, freight and round-off.",
  PAYMENT_TOO_MUCH: "Paid now is more than the bill total — record the extra separately as money paid.",
};

const realDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** The first problem with a bill's header, or null. Line problems are pricePurchase's. */
export function purchaseError(h: PurchaseHeaderInput, today: string): PurchaseErrorCode | null {
  if (h.lineCount < 1) return "NO_LINES";
  if (h.lineCount > MAX_PURCHASE_LINES) return "TOO_MANY_LINES";
  if (!h.supplierEntityId || !h.supplierEntityId.trim()) return "NO_SUPPLIER";
  if (typeof h.billNo !== "string" || !h.billNo.trim()) return "NO_BILL_NO";
  if (h.billNo.trim().length > MAX_BILL_NO_LENGTH) return "BILL_NO_TOO_LONG";
  if (typeof h.billDate !== "string" || !realDay(h.billDate)) return "BAD_DATE";
  if (h.billDate > today) return "FUTURE_DATE";
  if (!Number.isInteger(h.freightPaise) || h.freightPaise < 0 || h.freightPaise > MAX_LINE_TAXABLE_PAISE) return "BAD_FREIGHT";
  if (!Number.isInteger(h.roundOffPaise) || Math.abs(h.roundOffPaise) > MAX_ROUND_OFF_PAISE) return "BAD_ROUND_OFF";
  if (supplierGstState(h.supplierGstin) === null && h.lineRatesBp.some((r) => r > 0)) return "GST_WITHOUT_GSTIN";
  if (h.payments.length > MAX_PURCHASE_PAYMENTS) return "TOO_MANY_PAYMENTS";
  for (const p of h.payments) {
    if (!p.registerId || !Number.isInteger(p.amountPaise) || p.amountPaise <= 0) return "BAD_PAYMENT";
  }
  if (new Set(h.payments.map((p) => p.registerId)).size !== h.payments.length) return "SAME_REGISTER_TWICE";
  if (h.note && h.note.length > MAX_PURCHASE_NOTE_LENGTH) return "NOTE_TOO_LONG";
  return null;
}

/**
 * The worked-out bill against what the supplier printed, and paid-now against the
 * total: our total (with the round-off) must equal theirs to the paisa, the bill must
 * be more than ₹0, and nobody pays more than the bill.
 */
export function purchaseTotalsError(totals: PurchaseTotals, supplierBillTotalPaise: number, payments: readonly PurchasePaymentInput[]): PurchaseErrorCode | null {
  if (totals.billTotalPaise <= 0 || totals.subtotalPaise <= 0) return "ZERO_BILL";
  if (!Number.isInteger(supplierBillTotalPaise) || totals.billTotalPaise !== supplierBillTotalPaise) return "TOTAL_MISMATCH";
  const paid = payments.reduce((s, p) => s + p.amountPaise, 0);
  if (paid > totals.billTotalPaise) return "PAYMENT_TOO_MUCH";
  return null;
}

// ─── References and duplicates ─────────────────────────────────────────────────

/** "PB/2026-27/0001" — our own reference for finding a bill (an FY series). */
export function purchaseRef(fy: string, seq: number): string {
  if (!/^\d{4}-\d{2}$/.test(fy)) throw new RangeError(`Bad financial year "${fy}"`);
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Bad purchase sequence ${seq}`);
  return `${PURCHASE_REF_PREFIX}/${fy}/${String(seq).padStart(4, "0")}`;
}

/** The financial year a bill's reference is numbered in. */
export const purchaseFinancialYear = (billDate: string) => financialYear(billDate);

/** A bill number for duplicate checks: capitals, no spaces ("inv 12" = "INV12"). */
export function billNoKey(billNo: string): string {
  return billNo.replace(/\s+/g, "").toUpperCase();
}
