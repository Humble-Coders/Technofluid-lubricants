/**
 * Stock quantities are ALWAYS whole numbers of MILLI base units:
 * millilitres for litre products, grams for kg products, milli-pieces for pieces.
 *
 * Why: stock is a running sum of thousands of movements (2.5 L, 17.5 L, 0.9 L…).
 * With decimal litres that sum drifts; with integers it never does. Same reason
 * money is kept in paise.
 *
 * Inventory is tracked per product in base units, never in packs (PRD §7): all
 * pack sizes of one product draw from the same pool, and packs are only derived.
 */

export type BaseUnit = "L" | "kg" | "piece";
export type Milli = number;

export const BASE_UNITS: readonly BaseUnit[] = ["L", "kg", "piece"];

const MILLI_LABEL: Record<BaseUnit, string> = { L: "mL", kg: "g", piece: "milli-piece" };

export function assertMilli(value: number, label = "quantity"): Milli {
  if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} must be a whole number of milli-units, got ${value}`);
  }
  return value;
}

/** 2.5 (litres) → 2500 (mL). Rounded to the nearest milli-unit. */
export function toMilli(baseQuantity: number): Milli {
  if (!Number.isFinite(baseQuantity)) throw new RangeError(`Bad quantity ${baseQuantity}`);
  const scaled = baseQuantity * 1000;
  const rounded = Math.round(Math.abs(scaled));
  return assertMilli(scaled < 0 ? -rounded : rounded);
}

/** 2500 (mL) → 2.5 (litres). For display and for maths that has to leave integer land. */
export function fromMilli(milli: Milli): number {
  assertMilli(milli);
  return milli / 1000;
}

/** "26 L", "17.5 L", "180 kg", "12 pieces" — trailing zeros dropped. */
export function formatQuantity(milli: Milli, unit: BaseUnit, maxDecimals = 3): string {
  const value = fromMilli(milli);
  const text = value.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
  if (unit === "piece") return `${text} ${Math.abs(value) === 1 ? "piece" : "pieces"}`;
  return `${text} ${unit}`;
}

export function milliUnitLabel(unit: BaseUnit): string {
  return MILLI_LABEL[unit];
}

/** Litres → kilograms using density (kg per litre). Both sides in milli-units: mL → g. */
export function litresToKgMilli(millilitres: Milli, densityKgPerL: number): Milli {
  assertMilli(millilitres);
  assertDensity(densityKgPerL);
  return toMilli(fromMilli(millilitres) * densityKgPerL);
}

/** Kilograms → litres using density. g → mL. */
export function kgToLitresMilli(grams: Milli, densityKgPerL: number): Milli {
  assertMilli(grams);
  assertDensity(densityKgPerL);
  return toMilli(fromMilli(grams) / densityKgPerL);
}

/** Whole packs that can be filled from what is on hand: floor(onHand / packSize). */
export function packsAvailable(onHandMilli: Milli, packQtyMilli: Milli): number {
  assertMilli(onHandMilli, "on hand");
  assertMilli(packQtyMilli, "pack quantity");
  if (packQtyMilli <= 0) throw new RangeError("Pack quantity must be positive");
  if (onHandMilli <= 0) return 0;
  return Math.floor(onHandMilli / packQtyMilli);
}

/** Base units used by `packs` packs: 3 × 26 L cans → 78 000 mL. */
export function packsToMilli(packs: number, packQtyMilli: Milli): Milli {
  if (!Number.isInteger(packs)) throw new RangeError(`Packs must be whole, got ${packs}`);
  assertMilli(packQtyMilli, "pack quantity");
  return assertMilli(packs * packQtyMilli);
}

function assertDensity(density: number): void {
  if (!Number.isFinite(density) || density <= 0 || density > 5) {
    throw new RangeError(`Density must be a positive kg/L value, got ${density}`);
  }
}

/**
 * Parse a quantity typed by a person ("26", "17.5", "1,250.25") in base units into
 * milli-units, exactly — read from the text, never via floating point. More than three
 * decimals is refused rather than silently rounded. Negative numbers are refused: the
 * direction of a stock movement comes from its type, not its sign.
 */
export function parseQuantityToMilli(input: string): Milli {
  const text = input.replace(/[,\s]/g, "");
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) {
    throw new RangeError(`Not a quantity: "${input}"`);
  }
  const fraction = match[2] ?? "";
  if (fraction.length > 3) throw new RangeError(`At most 3 decimals: "${input}"`);
  const whole = match[1] === "" ? 0 : Number(match[1]);
  return assertMilli(whole * 1000 + Number(fraction.padEnd(3, "0")));
}

/** Today's business date in India (Technofluid is in Haryana) as "YYYY-MM-DD". */
export function indiaDate(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
}
