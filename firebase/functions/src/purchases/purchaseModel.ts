import {HttpsError} from "firebase-functions/v2/https";

import {checkGstin} from "../entities/entityModel";
import {financialYear} from "../sales/saleModel";

/**
 * Purchases — the server's copy of the rules in office/core/src/purchase.ts (brief:
 * docs/office/purchases-brief.md). Mirrored because the core package isn't built for the
 * functions; both copies run office/core/src/purchase.cases.json (vitest + the emulator
 * tests), so they can't drift. Keep the two in step.
 *
 *  - purchases/{id}: one per supplier bill; never edited — a mistake is a cancellation
 *    (stock goes back out, the books reverse) and a new bill.
 *  - purchaseSeries/{fy}: our PB/… reference series of one financial year (server-only).
 *  - purchaseRequests/{requestId}: makes retries harmless. purchaseSync/{id}: what has
 *    already been posted to the books, so a retry never re-posts (server-only).
 */

export const PURCHASES = "purchases";
export const PURCHASE_REQUESTS = "purchaseRequests";
export const PURCHASE_SYNC = "purchaseSync";
export const PURCHASE_SERIES = "purchaseSeries";

export const SELLER_STATE_CODE = "06";
export const MAX_PURCHASE_LINES = 60;
export const MAX_PURCHASE_PAYMENTS = 2;
export const MAX_ROUND_OFF_PAISE = 100;
export const MAX_PURCHASE_QTY_MILLI = 10_000_000_000;
export const MAX_LINE_TAXABLE_PAISE = 10_000_000_000;
export const MAX_BILL_NO_LENGTH = 40;
export const MAX_PURCHASE_NOTE_LENGTH = 300;
export const PURCHASE_REF_PREFIX = "PB";
export const BUYABLE_KINDS: readonly string[] = ["raw_material", "consumable", "product_pool"];

/** The one HL inventory account every purchase debits (made on first use). */
export const PURCHASE_ACCOUNTS = {
  inventory: {name: "Inventory · Purchased stock", type: "ASSET"},
} as const;

export function bad(message: string, code?: string): never {
  throw new HttpsError("invalid-argument", message, code ? {code} : undefined);
}

export const purchaseSourceIds = {
  bill: (id: string) => `purchase_${id}:bill`,
  payout: (id: string, i: number) => `purchase_${id}:payout_${i}`,
  cancel: (id: string) => `purchase_${id}:cancel`,
};

// ─── The bits of core money / gst the purchase maths uses ────────────────────────

const roundHalfAwayFromZero = (v: number) => (v < 0 ? -Math.round(-v) : Math.round(v));
const percentOfPaise = (paise: number, bp: number) => roundHalfAwayFromZero((paise * bp) / 10_000);

export interface RateRow {gstRateBp: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number}
interface LineTax {taxablePaise: number; gstRateBp: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number}

function taxLine(l: {taxablePaise: number; gstRateBp: number}, intra: boolean): LineTax {
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (intra) {
    cgstPaise = percentOfPaise(l.taxablePaise, l.gstRateBp / 2);
    sgstPaise = cgstPaise;
  } else {
    igstPaise = percentOfPaise(l.taxablePaise, l.gstRateBp);
  }
  return {taxablePaise: l.taxablePaise, gstRateBp: l.gstRateBp, cgstPaise, sgstPaise, igstPaise, totalPaise: l.taxablePaise + cgstPaise + sgstPaise + igstPaise};
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export type BaseUnit = "L" | "kg" | "piece";

export interface PurchaseItem {id: string; name: string; kind: string; baseUnit: BaseUnit | null}
export interface PurchaseLineInput {itemId: string; qtyMilli: number; taxablePaise: number; gstRateBp: number}

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
  unitCostPaise: number;
}

export interface PurchaseFreight {taxablePaise: number; gstRateBp: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number}
export type PurchaseSupplyType = "INTRA" | "INTER" | "NONE";

export interface PurchaseTotals {
  supplyType: PurchaseSupplyType;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  exactTotalPaise: number;
  roundOffPaise: number;
  billTotalPaise: number;
  subtotalPaise: number;
  byRate: RateRow[];
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

export const validGstRateBp = (bp: unknown): bp is number =>
  typeof bp === "number" && Number.isInteger(bp) && bp >= 0 && bp <= 10_000 && bp % 2 === 0;

export function supplierGstState(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const c = checkGstin(gstin);
  return c.valid ? c.stateCode : null;
}

export function unitCostPaise(taxablePaise: number, qtyMilli: number): number {
  if (qtyMilli <= 0) return 0;
  return Math.round((taxablePaise * 1000) / qtyMilli);
}

export interface PricePurchaseInput {
  items: Readonly<Record<string, PurchaseItem>>;
  lines: readonly PurchaseLineInput[];
  freightPaise: number;
  supplierStateCode: string | null;
  sellerStateCode: string;
  roundOffPaise: number;
}

export type PricedPurchase =
  | {ok: true; lines: PricedPurchaseLine[]; freight: PurchaseFreight | null; totals: PurchaseTotals}
  | {ok: false; errors: {line: number; code: PurchaseLineErrorCode}[]};

function lineError(item: PurchaseItem | undefined, l: PurchaseLineInput): PurchaseLineErrorCode | null {
  if (!item) return "UNKNOWN_ITEM";
  if (!BUYABLE_KINDS.includes(item.kind)) return "NOT_BUYABLE";
  if (!item.baseUnit) return "NO_UNIT";
  if (!Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0 || l.qtyMilli > MAX_PURCHASE_QTY_MILLI) return "BAD_QTY";
  if (!Number.isInteger(l.taxablePaise) || l.taxablePaise < 0 || l.taxablePaise > MAX_LINE_TAXABLE_PAISE) return "BAD_TAXABLE";
  if (!validGstRateBp(l.gstRateBp)) return "BAD_GST_RATE";
  return null;
}

export function pricePurchase(input: PricePurchaseInput): PricedPurchase {
  const errors: {line: number; code: PurchaseLineErrorCode}[] = [];
  input.lines.forEach((l, i) => {
    const code = lineError(input.items[l.itemId], l);
    if (code) errors.push({line: i, code});
  });
  if (errors.length > 0) return {ok: false, errors};

  const registered = input.supplierStateCode !== null;
  const rate = (bp: number) => (registered ? bp : 0);
  const intra = !registered || input.supplierStateCode === input.sellerStateCode;
  const freightRate = input.lines.reduce((max, l) => Math.max(max, rate(l.gstRateBp)), 0);
  const taxable = input.lines.map((l) => ({taxablePaise: l.taxablePaise, gstRateBp: rate(l.gstRateBp)}));
  if (input.freightPaise > 0) taxable.push({taxablePaise: input.freightPaise, gstRateBp: freightRate});
  const taxed = taxable.map((l) => taxLine(l, intra));

  const sum = (k: keyof LineTax) => taxed.reduce((s, l) => s + l[k], 0);
  const taxablePaise = sum("taxablePaise");
  const cgstPaise = sum("cgstPaise");
  const sgstPaise = sum("sgstPaise");
  const igstPaise = sum("igstPaise");
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  const exactTotalPaise = taxablePaise + taxPaise;
  const rates = new Map<number, RateRow>();
  for (const l of taxed) {
    const row = rates.get(l.gstRateBp) ?? {gstRateBp: l.gstRateBp, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0};
    row.taxablePaise += l.taxablePaise;
    row.cgstPaise += l.cgstPaise;
    row.sgstPaise += l.sgstPaise;
    row.igstPaise += l.igstPaise;
    rates.set(l.gstRateBp, row);
  }

  const lines: PricedPurchaseLine[] = input.lines.map((l, i) => {
    const item = input.items[l.itemId];
    const x = taxed[i];
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
  const f = input.freightPaise > 0 ? taxed[input.lines.length] : null;
  const roundOff = input.roundOffPaise;
  return {
    ok: true,
    lines,
    freight: f ? {taxablePaise: f.taxablePaise, gstRateBp: f.gstRateBp, cgstPaise: f.cgstPaise, sgstPaise: f.sgstPaise, igstPaise: f.igstPaise, totalPaise: f.totalPaise} : null,
    totals: {
      supplyType: !registered ? "NONE" : intra ? "INTRA" : "INTER",
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      taxPaise,
      exactTotalPaise,
      roundOffPaise: roundOff,
      billTotalPaise: exactTotalPaise + roundOff,
      subtotalPaise: taxablePaise + roundOff,
      byRate: [...rates.values()].sort((a, b) => a.gstRateBp - b.gstRateBp),
    },
  };
}

export function suggestRoundOff(exactTotalPaise: number): number {
  return roundHalfAwayFromZero(exactTotalPaise / 100) * 100 - exactTotalPaise;
}

// ─── The bill as a whole ───────────────────────────────────────────────────────

export interface PurchasePaymentInput {registerId: string; amountPaise: number}

export interface PurchaseHeaderInput {
  supplierEntityId: string;
  billNo: string;
  billDate: string;
  lineCount: number;
  lineRatesBp: readonly number[];
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

export function purchaseTotalsError(totals: Pick<PurchaseTotals, "billTotalPaise" | "subtotalPaise">, supplierBillTotalPaise: number, payments: readonly PurchasePaymentInput[]): PurchaseErrorCode | null {
  if (totals.billTotalPaise <= 0 || totals.subtotalPaise <= 0) return "ZERO_BILL";
  if (!Number.isInteger(supplierBillTotalPaise) || totals.billTotalPaise !== supplierBillTotalPaise) return "TOTAL_MISMATCH";
  const paid = payments.reduce((s, p) => s + p.amountPaise, 0);
  if (paid > totals.billTotalPaise) return "PAYMENT_TOO_MUCH";
  return null;
}

// ─── References and duplicates ─────────────────────────────────────────────────

export function purchaseRef(fy: string, seq: number): string {
  if (!/^\d{4}-\d{2}$/.test(fy)) throw new RangeError(`Bad financial year "${fy}"`);
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Bad purchase sequence ${seq}`);
  return `${PURCHASE_REF_PREFIX}/${fy}/${String(seq).padStart(4, "0")}`;
}

export const purchaseFinancialYear = (billDate: string) => financialYear(billDate);

export function billNoKey(billNo: string): string {
  return billNo.replace(/\s+/g, "").toUpperCase();
}

