import {HttpsError} from "firebase-functions/v2/https";

/**
 * The stock engine's shared vocabulary (decisions #21, #23, #24).
 *
 *  - stockItems/{id}: one per thing we count. Finished products are counted per
 *    STOCK POOL (all pack sizes of one product + grade share one figure), never
 *    per pack; plus raw materials and consumables.
 *  - stockMovements/{id}: an APPEND-ONLY diary. Every change is a new line
 *    (who, when, how much, why). Mistakes are fixed by reversing a line, never
 *    by editing it. No money anywhere — Stock & Production reads these.
 *  - Quantities are whole MILLI base units (mL / g / milli-pieces).
 *  - Only Cloud Functions write either collection.
 */

export const ITEMS = "stockItems";
export const MOVEMENTS = "stockMovements";
/** One record per handled request id — makes retries safe. Server-only. */
export const REQUESTS = "stockRequests";

export const ITEM_KINDS = ["product_pool", "raw_material", "consumable"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const BASE_UNITS = ["L", "kg", "piece"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/**
 * Movement types. Step 3 records OPENING / IN / OUT / COUNT (a count that
 * becomes a COUNT_ADJUSTMENT line) and REVERSAL. Production, purchases and
 * sales add their own types in later steps.
 */
export type MovementType =
  | "OPENING"
  | "IN"
  | "OUT"
  | "COUNT_ADJUSTMENT"
  | "REVERSAL"
  /** A product made in the factory (+), and the raw materials it used (−). */
  | "PRODUCTION_IN"
  | "PRODUCTION_CONSUME";

/** A product's stock pool id, derived from its productKey (product + grade). */
export function poolId(productKey: string): string {
  return `pool_${productKey}`;
}

/** Largest single quantity accepted: 10 million base units (10,000 kL). */
export const MAX_QTY_MILLI = 10_000_000_000;

export function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export function positiveMilli(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_QTY_MILLI
  ) {
    bad(`${label} must be a whole number of milli-units above 0.`);
  }
  return value;
}

export function nonNegativeMilli(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_QTY_MILLI
  ) {
    bad(`${label} must be a whole number of milli-units, 0 or more.`);
  }
  return value;
}

/** A short "why", trimmed. Required unless `optional`. */
export function note(value: unknown, label: string, optional = false): string | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (optional) return null;
    bad(`${label}: please say why.`);
  }
  if (typeof value !== "string") bad(`${label}: the reason must be text.`);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > 200) bad(`${label}: keep the reason under 200 characters.`);
  return trimmed;
}

/** Today in India ("YYYY-MM-DD") — the business date Technofluid works in. */
export function indiaToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(at);
}

/** A business date: "YYYY-MM-DD", a real calendar day, not in the future. */
export function journalDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    bad("Date must look like 2026-10-15.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    bad(`"${value}" isn't a real date.`);
  }
  if (value > indiaToday()) bad("Stock can't be recorded for a future date.");
  return value;
}

/** Client-chosen id that makes a request safe to retry (same id = same request). */
export function requestId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) {
    bad("requestId must be 8–64 letters, digits, - or _.");
  }
  return value;
}
