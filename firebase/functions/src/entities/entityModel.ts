import {HttpsError} from "firebase-functions/v2/https";

/**
 * Customers & suppliers ("entities") — the server's copy of the rules in
 * office/core/src/entity.ts (brief: docs/office/entities-brief.md).
 *
 * The office core package is TypeScript source only and the functions don't build it,
 * so — like stock and recipes — the rules are mirrored here. Both copies run the same
 * table, office/core/src/entity.cases.json (vitest + the emulator tests), so a change to
 * one without the other fails a test. Keep the two in step.
 *
 *  - entities/{id}: the profile (Firestore). HL holds the money; no balance is stored.
 *  - entities/{id}/history/{auto}: what changed, by whom (written by the callables).
 *  - entityRequests/{requestId}: server-only, makes retries harmless.
 *  - Only Cloud Functions write any of these; Admin + Accounts read entities.
 */

export const ENTITIES = "entities";
export const ENTITY_REQUESTS = "entityRequests";
export const WALK_IN_ENTITY_ID = "walk-in-customer";
/** Technofluid's own state (Haryana) — the walk-in customer is local. */
export const SELLER_STATE_CODE = "06";

export type EntityKind = "customer" | "supplier";
export const ENTITY_KINDS: readonly EntityKind[] = ["customer", "supplier"];
export type SyncStatus = "PENDING" | "SYNCED" | "FAILED";

export interface EntityAddress {
  line1: string;
  line2: string;
  city: string;
  district: string;
  pincode: string;
  stateCode: string | null;
}

export interface EntityInput {
  name: string;
  kinds: EntityKind[];
  phones: string[];
  email: string | null;
  gstin: string | null;
  address: EntityAddress;
  priceTier: "Dealer" | "Distributor" | null;
  creditLimitPaise: number | null;
  notes: string | null;
  opening?: {amountPaise: number; direction: "receivable" | "payable"; asOf: string} | null;
}

export interface EntityError {
  field: string;
  code: string;
  message: string;
}

// ─── GST (mirror of office/core/src/gst.ts) ─────────────────────────────────────

const GST_STATE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18",
  "19", "20", "21", "22", "23", "24", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "97",
]);
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const isValidStateCode = (code: string) => GST_STATE_CODES.has(code);

function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i] ?? "");
    if (value < 0) return "";
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export function checkGstin(input: string): {valid: true; gstin: string; stateCode: string} | {valid: false; gstin: string; reason: string} {
  const gstin = input.replace(/\s+/g, "").toUpperCase();
  if (gstin.length !== 15) return {valid: false, gstin, reason: "A GSTIN has 15 characters"};
  if (!GSTIN_SHAPE.test(gstin)) return {valid: false, gstin, reason: "This does not look like a GSTIN"};
  const stateCode = gstin.slice(0, 2);
  if (!isValidStateCode(stateCode)) return {valid: false, gstin, reason: `Unknown state code ${stateCode}`};
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return {valid: false, gstin, reason: "Check digit does not match — probably a typo"};
  }
  return {valid: true, gstin, stateCode};
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const check = checkGstin(gstin);
  return check.valid ? check.stateCode : null;
}

// ─── Entity rules (mirror of office/core/src/entity.ts) ─────────────────────────

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 10 ? digits : digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : null;
  if (!ten || !/^[1-9]\d{9}$/.test(ten)) return null;
  return `+91${ten}`;
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

export function checkEntityInput(
  raw: unknown,
  opts: {allowMissingState?: boolean} = {},
): {ok: true; value: EntityInput} | {ok: false; errors: EntityError[]} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: EntityError[] = [];
  const err = (field: string, code: string, message: string) => errors.push({field, code, message});

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

  const priceTier = r.priceTier === undefined || r.priceTier === null || r.priceTier === "" ? null : (r.priceTier as EntityInput["priceTier"]);
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
    opening = {amountPaise: amount as number, direction: o.direction as "receivable" | "payable", asOf};
  }

  if (errors.length > 0) return {ok: false, errors};
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
      ...(opening ? {opening} : {}),
    },
  };
}

/** Throws invalid-argument with every problem; `details.codes` lists the error codes. */
export function parseEntityInput(raw: unknown, opts: {allowMissingState?: boolean} = {}): EntityInput {
  const r = checkEntityInput(raw, opts);
  if (!r.ok) {
    throw new HttpsError("invalid-argument", r.errors.map((e) => e.message).join(" "), {
      codes: [...new Set(r.errors.map((e) => e.code))],
      fields: r.errors.map((e) => e.field),
    });
  }
  return r.value;
}

/** HL's decimal-rupee STRING → integer paise, no floats; more than 2 decimals refused. */
export function hlAmountToPaise(value: string): number {
  if (typeof value !== "string") throw new TypeError("HL amounts are read from strings");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new RangeError(`"${value}" isn't an amount with at most 2 decimals`);
  const paise = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] && paise !== 0 ? -paise : paise;
}

export interface HlProfile {
  name: string;
  phones: readonly string[];
  email: string | null;
  gstin: string | null;
}

export function hlProfileChanged(before: HlProfile, after: HlProfile): boolean {
  return (
    before.name !== after.name ||
    (before.phones?.[0] ?? null) !== (after.phones?.[0] ?? null) ||
    (before.email ?? null) !== (after.email ?? null) ||
    (before.gstin ?? null) !== (after.gstin ?? null)
  );
}

export const balanceDirection = (signedPaise: number) =>
  signedPaise > 0 ? "receivable" : signedPaise < 0 ? "payable" : "settled";

export const sourceIds = {
  opening: (entityId: string) => `entity_${entityId}:opening`,
};

export function sourceGroup(sourceId: string): string {
  const i = sourceId.indexOf(":");
  return i < 0 ? sourceId : sourceId.slice(0, i);
}

/** "₹12,500.50" for messages (Indian grouping). */
export function formatRupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = String(Math.floor(abs / 100));
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  const p = abs % 100;
  return `${sign}₹${grouped}${p ? `.${String(p).padStart(2, "0")}` : ""}`;
}

export function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

/** Entity changes logged per field: {field: {from, to}}. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>, fields: readonly string[]) {
  const changes: Record<string, {from: unknown; to: unknown}> = {};
  for (const f of fields) {
    if (JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)) {
      changes[f] = {from: before[f] ?? null, to: after[f] ?? null};
    }
  }
  return changes;
}

export const EDITABLE_FIELDS = ["name", "kinds", "phones", "email", "gstin", "address", "priceTier", "creditLimitPaise", "notes"] as const;
