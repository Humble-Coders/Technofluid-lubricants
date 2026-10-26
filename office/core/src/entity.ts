/**
 * Customers & suppliers ("entities") — the shared rules (brief: docs/office/entities-brief.md).
 *
 * Every person or firm Technofluid deals with money-wise is one entity, mirrored as ONE
 * Humble Ledger (HL) customer. HL holds the money (balance, statement, opening balance);
 * Firestore holds the profile. Buying and selling net into one balance:
 * positive = they owe us (receivable), negative = we owe them (payable).
 *
 * Pure — no Firebase, no UI. The same rules are mirrored on the server in
 * firebase/functions/src/entities/entityModel.ts; both run entity.cases.json so the two
 * copies can't drift.
 *
 * Money: integer paise everywhere here. HL speaks decimal rupees — convert only at the HL
 * boundary (hlAmountToPaise for reading HL's decimal strings).
 */
import { checkGstin, isValidStateCode } from "./gst";

/** The one walk-in / cash customer. One constant — never a second id (Aromex lesson 5). */
export const WALK_IN_ENTITY_ID = "walk-in-customer";

export type EntityKind = "customer" | "supplier";
export const ENTITY_KINDS: readonly EntityKind[] = ["customer", "supplier"];

export type PriceTier = "Dealer" | "Distributor";
export type BalanceDirection = "receivable" | "payable" | "settled";
export type SyncStatus = "PENDING" | "SYNCED" | "FAILED";

export interface EntityAddress {
  line1: string;
  line2: string;
  city: string;
  district: string;
  pincode: string;
  /** GST place of supply (2 digits, GST_STATES). Null only for an import flagged "state needed". */
  stateCode: string | null;
}

export interface OpeningBalance {
  /** Always positive; `direction` says who owes whom. */
  amountPaise: number;
  direction: "receivable" | "payable";
  /** The business date HL books it on (never the sync day — Aromex lesson 2). */
  asOf: string;
  posted: boolean;
  hlTxnId?: string | null;
}

/** What a person fills in (the form) and the callable accepts. */
export interface EntityInput {
  name: string;
  kinds: EntityKind[];
  phones: string[];
  email: string | null;
  gstin: string | null;
  address: EntityAddress;
  priceTier: PriceTier | null;
  creditLimitPaise: number | null;
  notes: string | null;
  /** Create only — refused on edit. */
  opening?: { amountPaise: number; direction: "receivable" | "payable"; asOf: string } | null;
}

export interface Entity extends Omit<EntityInput, "opening"> {
  id: string;
  nameLower: string;
  gstVerified: { legalName: string; tradeName: string; status: string; verifiedAt: string } | null;
  distributorId: string | null;
  isWalkIn: boolean;
  isActive: boolean;
  deleted: boolean;
  opening: OpeningBalance | null;
  syncStatus: SyncStatus;
  hlCustomerId: string | null;
  hlAccountId: string | null;
  hlSyncError: string | null;
  syncAttempts: number;
}

export type EntityErrorCode =
  | "name_required"
  | "name_too_long"
  | "kinds_empty"
  | "kind_unknown"
  | "too_many_phones"
  | "phone_invalid"
  | "email_invalid"
  | "gstin_invalid"
  | "state_required"
  | "state_unknown"
  | "gstin_state_mismatch"
  | "pincode_invalid"
  | "price_tier_invalid"
  | "credit_limit_invalid"
  | "notes_too_long"
  | "opening_amount_invalid"
  | "opening_direction_invalid"
  | "opening_date_invalid";

export interface EntityError {
  field: string;
  code: EntityErrorCode;
  message: string;
}

export type EntityCheck = { ok: true; value: EntityInput } | { ok: false; errors: EntityError[] };

/** "98765 43210", "+91-98765-43210", "098765 43210" → "+919876543210"; null if not an Indian mobile/landline. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 10 ? digits : digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : null;
  if (!ten || !/^[1-9]\d{9}$/.test(ten)) return null;
  return `+91${ten}`;
}

/** The GST state code a GSTIN belongs to (its first 2 digits), or null. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const check = checkGstin(gstin);
  return check.valid ? check.stateCode : null;
}

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const blankToNull = (v: unknown) => text(v) || null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(ymd: string): boolean {
  if (!DATE_RE.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

/**
 * Checks and normalises an entity as typed (blank email → null, phones → +91…, GSTIN
 * upper-cased). `opts.allowMissingState` is for website-distributor imports only.
 */
export function checkEntityInput(raw: unknown, opts: { allowMissingState?: boolean } = {}): EntityCheck {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: EntityError[] = [];
  const err = (field: string, code: EntityErrorCode, message: string) => errors.push({ field, code, message });

  const name = text(r.name);
  if (!name) err("name", "name_required", "Enter a name.");
  else if (name.length > 120) err("name", "name_too_long", "Keep the name under 120 characters.");

  const kindsIn = Array.isArray(r.kinds) ? r.kinds : [];
  const kinds = [...new Set(kindsIn)] as EntityKind[];
  if (kinds.length === 0) err("kinds", "kinds_empty", "Tick customer, supplier or both.");
  else if (kinds.some((k) => !ENTITY_KINDS.includes(k))) err("kinds", "kind_unknown", "Kind must be customer or supplier.");

  const phonesIn = (Array.isArray(r.phones) ? r.phones : []).map(text).filter(Boolean);
  const phones: string[] = [];
  if (phonesIn.length > 3) err("phones", "too_many_phones", "At most 3 phone numbers.");
  for (const p of phonesIn.slice(0, 3)) {
    const n = normalizePhone(p);
    if (!n) err("phones", "phone_invalid", `"${p}" isn't a 10-digit Indian number.`);
    else if (!phones.includes(n)) phones.push(n);
  }

  const emailText = blankToNull(r.email);
  const email = emailText ? emailText.toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) err("email", "email_invalid", "That email doesn't look right.");

  let gstin: string | null = null;
  const gstinText = blankToNull(r.gstin);
  if (gstinText) {
    const check = checkGstin(gstinText);
    if (!check.valid) err("gstin", "gstin_invalid", `GSTIN: ${check.reason}.`);
    gstin = check.gstin;
  }

  const a = (r.address ?? {}) as Record<string, unknown>;
  const stateCode = blankToNull(a.stateCode);
  const address: EntityAddress = {
    line1: text(a.line1),
    line2: text(a.line2),
    city: text(a.city),
    district: text(a.district),
    pincode: text(a.pincode),
    stateCode,
  };
  if (!stateCode) {
    if (!opts.allowMissingState) err("address.stateCode", "state_required", "Choose the state (GST place of supply).");
  } else if (!isValidStateCode(stateCode)) {
    err("address.stateCode", "state_unknown", `Unknown state code ${stateCode}.`);
  } else if (gstin && errors.every((e) => e.field !== "gstin") && gstin.slice(0, 2) !== stateCode) {
    err("address.stateCode", "gstin_state_mismatch", `The GSTIN is from state ${gstin.slice(0, 2)}, but the state chosen is ${stateCode}.`);
  }
  if (address.pincode && !/^[1-9]\d{5}$/.test(address.pincode)) err("address.pincode", "pincode_invalid", "A PIN code has 6 digits.");

  const priceTier = r.priceTier === undefined || r.priceTier === null || r.priceTier === "" ? null : (r.priceTier as PriceTier);
  if (priceTier !== null && priceTier !== "Dealer" && priceTier !== "Distributor") {
    err("priceTier", "price_tier_invalid", "Price list must be Dealer or Distributor.");
  }

  const credit = r.creditLimitPaise === undefined || r.creditLimitPaise === null ? null : r.creditLimitPaise;
  if (credit !== null && (typeof credit !== "number" || !Number.isInteger(credit) || credit < 0 || credit > 1e13)) {
    err("creditLimitPaise", "credit_limit_invalid", "Credit limit must be a whole amount of ₹0 or more.");
  }

  const notes = typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null;
  if (notes && notes.length > 1000) err("notes", "notes_too_long", "Keep notes under 1000 characters.");

  let opening: EntityInput["opening"] = null;
  if (r.opening !== undefined && r.opening !== null) {
    const o = r.opening as Record<string, unknown>;
    const amount = o.amountPaise;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > 1e13) {
      err("opening.amountPaise", "opening_amount_invalid", "Opening balance must be above ₹0 (or leave it out).");
    }
    if (o.direction !== "receivable" && o.direction !== "payable") {
      err("opening.direction", "opening_direction_invalid", "Say whether they owe us or we owe them.");
    }
    const asOf = text(o.asOf);
    if (!isRealDate(asOf)) err("opening.asOf", "opening_date_invalid", "Give the date the opening balance is as of (YYYY-MM-DD).");
    opening = { amountPaise: amount as number, direction: o.direction as "receivable" | "payable", asOf };
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      kinds,
      phones,
      email,
      gstin,
      address,
      priceTier,
      creditLimitPaise: credit as number | null,
      notes,
      ...(opening ? { opening } : {}),
    },
  };
}

/** Positive = they owe us, negative = we owe them. */
export function balanceDirection(signedPaise: number): BalanceDirection {
  return signedPaise > 0 ? "receivable" : signedPaise < 0 ? "payable" : "settled";
}

/**
 * HL's decimal-rupee STRING → integer paise, without floating point:
 * "1234.5" → 123450, "-0.01" → -1. More than 2 decimals is refused, never rounded.
 */
export function hlAmountToPaise(value: string): number {
  if (typeof value !== "string") throw new TypeError("HL amounts are read from strings");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new RangeError(`"${value}" isn't an amount with at most 2 decimals`);
  const paise = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] && paise !== 0 ? -paise : paise;
}

/** The profile fields HL keeps. Only a change to one of these updates the HL customer. */
export interface HlProfile {
  name: string;
  phones: readonly string[];
  email: string | null;
  gstin: string | null;
}

export function hlProfileChanged(before: HlProfile, after: HlProfile): boolean {
  return (
    before.name !== after.name ||
    (before.phones[0] ?? null) !== (after.phones[0] ?? null) ||
    (before.email ?? null) !== (after.email ?? null) ||
    (before.gstin ?? null) !== (after.gstin ?? null)
  );
}

/**
 * Deterministic HL sourceIds (never random or time-based): doc id + leg. The part before
 * ":" groups a statement's rows ("sale_ab12" covers its goods and GST legs).
 */
export const sourceIds = {
  opening: (entityId: string) => `entity_${entityId}:opening`,
  sale: (saleId: string, leg: string) => `sale_${saleId}:${leg}`,
  payment: (paymentId: string) => `payment_${paymentId}`,
  purchase: (purchaseId: string, leg: string) => `purchase_${purchaseId}:${leg}`,
  payout: (payoutId: string) => `payout_${payoutId}`,
};

/** "sale_ab12:gst" → "sale_ab12" — one statement row per group. */
export function sourceGroup(sourceId: string): string {
  const i = sourceId.indexOf(":");
  return i < 0 ? sourceId : sourceId.slice(0, i);
}
