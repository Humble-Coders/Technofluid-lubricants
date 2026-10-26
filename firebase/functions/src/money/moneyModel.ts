import {HttpsError} from "firebase-functions/v2/https";

import {checkGstin} from "../entities/entityModel";

/**
 * Money in & out — the server's copy of the rules in office/core/src/money-entry.ts
 * (brief: docs/office/money-brief.md). Like entityModel, mirrored because the core
 * package isn't built for the functions; both copies run office/core/src/
 * money-entry.cases.json (vitest + the emulator tests), so they can't drift. Keep the
 * two in step — the logic below is the core file's, line for line.
 *
 *  - moneyEntries/{id}: one per movement; never edited by people; the mirror is the undo.
 *  - registers/{id}: our cash boxes and bank accounts, each pinned once to an HL ASSET
 *    account (hlAccountId); expenseCategories/{id} likewise to an HL EXPENSE account.
 *  - moneyRequests/{requestId}: server-only, makes retries harmless.
 */

export const MONEY_ENTRIES = "moneyEntries";
export const REGISTERS = "registers";
export const EXPENSE_CATEGORIES = "expenseCategories";
export const MONEY_REQUESTS = "moneyRequests";

/** HL system accounts (made on first use, then found by name — names are unique in HL). */
export const SYSTEM_ACCOUNTS = {
  openingEquity: {name: "Opening Balance Equity", type: "EQUITY"},
  balanceAdjustments: {name: "Balance Adjustments", type: "EXPENSE"},
  cashOverShort: {name: "Cash Over and Short", type: "EXPENSE"},
  inputCgst: {name: "Input CGST", type: "ASSET", isTaxAccount: true},
  inputSgst: {name: "Input SGST", type: "ASSET", isTaxAccount: true},
  inputIgst: {name: "Input IGST", type: "ASSET", isTaxAccount: true},
} as const;

export function bad(message: string, code?: string): never {
  throw new HttpsError("invalid-argument", message, code ? {code} : undefined);
}


/** Technofluid's own state (Haryana) — GST on a bill from here is CGST + SGST. */
export const SELLER_STATE_CODE = "06";

/** The two registers every install has (one constant — never resolved by name). */
export const DEFAULT_CASH_REGISTER_ID = "default-cash";
export const DEFAULT_BANK_REGISTER_ID = "default-bank";
export const DEFAULT_REGISTERS = [
  { id: DEFAULT_CASH_REGISTER_ID, name: "Cash in hand", kind: "CASH" as const, displayOrder: 0 },
  { id: DEFAULT_BANK_REGISTER_ID, name: "Bank", kind: "BANK" as const, displayOrder: 1 },
];
/** Names only a default register may use (case-insensitive). */
export const RESERVED_REGISTER_NAMES = ["cash", "bank", "inventory"];

export type RegisterKind = "CASH" | "BANK";

/** One side of an entry. Every side carries its id and the name as it was then. */
export type MoneyAccountRef =
  | { kind: "PARTY"; entityId: string; name: string }
  | { kind: "CASH" | "BANK"; registerId: string; name: string }
  | { kind: "EXPENSE"; categoryId: string; name: string }
  | { kind: "ADJUSTMENT" };

export interface ExpenseGst {
  supplier: { entityId: string | null; name: string; gstin: string; stateCode: string };
  billNo: string;
  billDate: string;
  rateBp: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface MoneyEntryInput {
  from: MoneyAccountRef;
  to: MoneyAccountRef;
  /** Positive; for an expense, the gross (bill total). */
  amountPaise: number;
  /** The posting date (YYYY-MM-DD, India time) — required. */
  businessDay: string;
  note: string | null;
  isCorrection: boolean;
  gst?: ExpenseGst | null;
}

export interface MoneyEntryState {
  syncStatus: "PENDING" | "SYNCED" | "FAILED";
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
}

export type MoneyDirection = "IN" | "OUT" | "INTERNAL";

export type MoneyErrorCode =
  | "REASON_REQUIRED"
  | "EXPENSE_REVERSAL_ONLY"
  | "EXPENSE_NEEDS_REGISTER"
  | "ADJUSTMENT_NEEDS_PARTY_OR_REGISTER"
  | "CORRECTION_MISMATCH"
  | "SAME_ACCOUNT"
  | "INVALID_AMOUNT"
  | "FUTURE_DAY"
  | "BAD_DAY"
  | "NOTE_TOO_LONG"
  | "GST_BAD_GSTIN"
  | "GST_SPLIT_MISMATCH"
  | "GST_WRONG_TYPE";

export const MONEY_ERROR_TEXT: Record<MoneyErrorCode, string> = {
  REASON_REQUIRED: "Say why — a correction needs a reason.",
  EXPENSE_REVERSAL_ONLY: "Money can't come from an expense (that only happens when an expense is reversed).",
  EXPENSE_NEEDS_REGISTER: "An expense is paid from cash or a bank account.",
  ADJUSTMENT_NEEDS_PARTY_OR_REGISTER: "A correction is for one customer/supplier or one cash/bank account.",
  CORRECTION_MISMATCH: "A correction must have the adjustment on exactly one side.",
  SAME_ACCOUNT: "From and To are the same.",
  INVALID_AMOUNT: "Enter an amount above ₹0.",
  FUTURE_DAY: "The day can't be in the future.",
  BAD_DAY: "Choose the day it happened.",
  NOTE_TOO_LONG: "Keep the note under 500 characters.",
  GST_BAD_GSTIN: "The supplier's GSTIN or state isn't right.",
  GST_SPLIT_MISMATCH: "The GST amounts don't add up for this rate and total.",
  GST_WRONG_TYPE: "Use CGST + SGST for a Haryana supplier, IGST for any other state.",
};

const isRegister = (r: MoneyAccountRef): r is Extract<MoneyAccountRef, { kind: "CASH" | "BANK" }> => r.kind === "CASH" || r.kind === "BANK";
export const isOwnAccount = isRegister;

/** IN, OUT or INTERNAL — for colours and filters. The order of these checks matters. */
export function moneyDirection(e: { from: MoneyAccountRef; to: MoneyAccountRef }): MoneyDirection {
  if (e.to.kind === "EXPENSE") return "OUT";
  if (e.from.kind === "EXPENSE") return "IN"; // an expense's mirror
  if (e.from.kind === "PARTY" && e.to.kind === "PARTY") return "INTERNAL";
  if (!isRegister(e.from)) return "IN";
  if (e.to.kind === "PARTY") return "OUT";
  return "INTERNAL";
}

/** Same account on both sides? Compared by id, per kind. */
export function isSameAccountAs(a: MoneyAccountRef, b: MoneyAccountRef): boolean {
  if (a.kind === "ADJUSTMENT" || b.kind === "ADJUSTMENT") return a.kind === b.kind;
  if (a.kind === "PARTY" && b.kind === "PARTY") return a.entityId === b.entityId;
  if (a.kind === "EXPENSE" && b.kind === "EXPENSE") return a.categoryId === b.categoryId;
  if (isRegister(a) && isRegister(b)) return a.registerId === b.registerId;
  return false;
}

export const canReverse = (e: MoneyEntryState) => e.syncStatus === "SYNCED" && !e.reversedByEntryId && !e.reversesEntryId;
export const isCancelled = (e: MoneyEntryState) => Boolean(e.reversedByEntryId || e.reversesEntryId);

function isRealDay(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

/** Half away from zero, like the rest of the money maths. */
const pct = (paise: number, bp: number) => {
  const v = (paise * bp) / 10_000;
  return v < 0 ? -Math.round(-v) : Math.round(v);
};

export interface GstSplit {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  grossPaise: number;
}

/**
 * The GST split of an expense bill. Give EITHER the bill total (gross) or the taxable
 * value. Tax is worked out on the taxable value (intra-state: CGST and SGST each at half
 * the rate, rounded separately; inter-state: IGST), so from a total the taxable value is
 * whatever is left after tax — the bill total is never changed.
 */
export function expenseGstSplit(p: { grossPaise?: number; taxablePaise?: number; rateBp: number; supplierStateCode: string }): GstSplit {
  const intra = p.supplierStateCode === SELLER_STATE_CODE;
  const taxOn = (taxable: number) => (intra ? { cgst: pct(taxable, p.rateBp / 2), sgst: pct(taxable, p.rateBp / 2), igst: 0 } : { cgst: 0, sgst: 0, igst: pct(taxable, p.rateBp) });
  if (p.taxablePaise !== undefined) {
    const t = taxOn(p.taxablePaise);
    return { taxablePaise: p.taxablePaise, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, grossPaise: p.taxablePaise + t.cgst + t.sgst + t.igst };
  }
  const gross = p.grossPaise ?? 0;
  // Taxable value that best reproduces the total; then tax on it; taxable absorbs the paisa.
  const estimate = Math.round((gross * 10_000) / (10_000 + p.rateBp));
  const t = taxOn(estimate);
  const taxable = gross - t.cgst - t.sgst - t.igst;
  return { taxablePaise: taxable, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, grossPaise: gross };
}

/**
 * The FIRST thing wrong with an entry, or null — so the form's Save button and the Cloud
 * Function refuse exactly the same entries. `today` is India's date (YYYY-MM-DD).
 */
export function moneyEntryError(e: MoneyEntryInput, today: string): MoneyErrorCode | null {
  const note = (e.note ?? "").trim();
  if (e.isCorrection && !note) return "REASON_REQUIRED";
  if (e.from.kind === "EXPENSE") return "EXPENSE_REVERSAL_ONLY";
  if (e.to.kind === "EXPENSE" && !isRegister(e.from)) return "EXPENSE_NEEDS_REGISTER";
  const adjFrom = e.from.kind === "ADJUSTMENT";
  const adjTo = e.to.kind === "ADJUSTMENT";
  // (`from` can't be an expense here — that returned above.)
  if ((adjFrom && adjTo) || (adjFrom && e.to.kind === "EXPENSE")) {
    return "ADJUSTMENT_NEEDS_PARTY_OR_REGISTER";
  }
  if (e.isCorrection !== (adjFrom !== adjTo)) return "CORRECTION_MISMATCH";
  if (isSameAccountAs(e.from, e.to)) return "SAME_ACCOUNT";
  if (!Number.isInteger(e.amountPaise) || e.amountPaise <= 0 || e.amountPaise > 1e13) return "INVALID_AMOUNT";
  if (!isRealDay(e.businessDay)) return "BAD_DAY";
  if (e.businessDay > today) return "FUTURE_DAY";
  if (note.length > 500) return "NOTE_TOO_LONG";
  if (e.gst) {
    if (e.to.kind !== "EXPENSE") return "GST_WRONG_TYPE";
    const g = e.gst;
    const check = checkGstin(g.supplier.gstin ?? "");
    if (!check.valid || check.stateCode !== g.supplier.stateCode) return "GST_BAD_GSTIN";
    const intra = g.supplier.stateCode === SELLER_STATE_CODE;
    if (intra ? g.igstPaise !== 0 || g.cgstPaise !== g.sgstPaise : g.cgstPaise !== 0 || g.sgstPaise !== 0) return "GST_WRONG_TYPE";
    const parts = [g.taxablePaise, g.cgstPaise, g.sgstPaise, g.igstPaise];
    if (!Number.isInteger(g.rateBp) || g.rateBp < 0 || g.rateBp > 4000 || g.rateBp % 2 !== 0) return "GST_SPLIT_MISMATCH";
    if (parts.some((x) => !Number.isInteger(x) || x < 0)) return "GST_SPLIT_MISMATCH";
    if (parts.reduce((a, b) => a + b, 0) !== e.amountPaise) return "GST_SPLIT_MISMATCH";
    const expected = expenseGstSplit({ taxablePaise: g.taxablePaise, rateBp: g.rateBp, supplierStateCode: g.supplier.stateCode });
    if (expected.cgstPaise !== g.cgstPaise || expected.sgstPaise !== g.sgstPaise || expected.igstPaise !== g.igstPaise) return "GST_SPLIT_MISMATCH";
  }
  return null;
}

/**
 * The correction that makes a party's or register's balance what it should be.
 * SIGNED balances (party: + they owe us; register: + money in it) — an absolute value
 * would silently treat a party we owe as one who owes us. Null when it's already right.
 */
export function correctionFor(
  target: Extract<MoneyAccountRef, { kind: "PARTY" | "CASH" | "BANK" }>,
  currentSignedPaise: number,
  wantedSignedPaise: number,
): { from: MoneyAccountRef; to: MoneyAccountRef; amountPaise: number; isCorrection: true } | null {
  const diff = wantedSignedPaise - currentSignedPaise;
  if (diff === 0) return null;
  const adj: MoneyAccountRef = { kind: "ADJUSTMENT" };
  return diff > 0
    ? { from: adj, to: target, amountPaise: diff, isCorrection: true }
    : { from: target, to: adj, amountPaise: -diff, isCorrection: true };
}

/** Deterministic HL sourceIds (never random or time-based). */
export const moneySourceIds = {
  entry: (entryId: string) => `money_${entryId}`,
  registerOpening: (registerId: string) => `register_${registerId}:opening`,
};
