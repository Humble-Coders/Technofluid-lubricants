/**
 * Money is ALWAYS an integer number of paise (₹1.00 = 100). Never store or add
 * rupees as floating point: 0.1 + 0.2 !== 0.3, and on an invoice that becomes a
 * one-paisa mismatch the accountant has to chase.
 *
 * Convert to rupees only at the edges — for display (`formatINR`) and for APIs
 * that take decimal rupees, like Humble Ledger (`paiseToRupees`).
 */

export type Paise = number;

const MAX_SAFE_PAISE = Number.MAX_SAFE_INTEGER;

/** Throws if `value` is not a whole number of paise. Use at every trust boundary. */
export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isInteger(value) || Math.abs(value) > MAX_SAFE_PAISE) {
    throw new RangeError(`${label} must be a whole number of paise, got ${value}`);
  }
  return value;
}

/** Round half away from zero — the convention accountants expect (2.5 → 3, −2.5 → −3). */
export function roundHalfAwayFromZero(value: number): number {
  const rounded = Math.round(Math.abs(value));
  return value < 0 ? -rounded : rounded;
}

/**
 * Parse a rupee amount typed by a person ("1,234.5", "₹ 99", "-10.005") into paise.
 * Parsed from the text, not via floating point, so "0.29" is exactly 29 paise.
 * More than two decimals are rounded half away from zero.
 */
export function rupeesToPaise(input: string | number): Paise {
  const text = (typeof input === "number" ? numberToPlainString(input) : input)
    .replace(/[₹,\s]/g, "")
    .trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new RangeError(`Not a rupee amount: "${String(input)}"`);
  }
  const negative = match[1] === "-";
  const whole = match[2] === "" ? 0 : Number(match[2]);
  const fraction = (match[3] ?? "").padEnd(3, "0");
  let paise = whole * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) paise += 1; // third decimal decides, half away from zero
  return assertPaise(negative ? -paise : paise);
}

/** Paise → decimal rupees, for APIs that want rupees (e.g. Humble Ledger). */
export function paiseToRupees(paise: Paise): number {
  assertPaise(paise);
  return paise / 100;
}

/**
 * ₹ with Indian digit grouping: 12345678 paise → "₹1,23,456.78".
 * Built from the integer, so display never shows float artefacts.
 */
export function formatINR(paise: Paise, options: { symbol?: boolean; decimals?: boolean } = {}): string {
  assertPaise(paise);
  const { symbol = true, decimals = true } = options;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  const grouped = groupIndian(String(rupees));
  const body = decimals ? `${grouped}.${fraction}` : grouped;
  return `${negative ? "−" : ""}${symbol ? "₹" : ""}${body}`;
}

/** 1234567 → "12,34,567" (last three digits, then pairs). */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** Price × quantity where quantity may be fractional (e.g. 2.5 litres). Rounded to the paisa. */
export function multiplyPaise(paise: Paise, quantity: number): Paise {
  assertPaise(paise);
  if (!Number.isFinite(quantity)) throw new RangeError(`Bad quantity ${quantity}`);
  return assertPaise(roundHalfAwayFromZero(paise * quantity));
}

/**
 * Percentage of an amount, with the rate in BASIS POINTS (18% = 1800, 2.5% = 250)
 * so the rate itself is an integer and the maths stays exact until the final round.
 */
export function percentOfPaise(paise: Paise, rateBasisPoints: number): Paise {
  assertPaise(paise);
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new RangeError(`Rate must be whole basis points, got ${rateBasisPoints}`);
  }
  return assertPaise(roundHalfAwayFromZero((paise * rateBasisPoints) / 10_000));
}

export function sumPaise(values: readonly Paise[]): Paise {
  return values.reduce((total, value) => assertPaise(total + assertPaise(value)), 0);
}

/**
 * Round an invoice total to the nearest rupee, as Indian invoices usually show:
 * returns the rounded total and the "Round off" line (may be negative).
 */
export function roundOffToRupee(paise: Paise): { total: Paise; roundOff: Paise } {
  assertPaise(paise);
  const total = roundHalfAwayFromZero(paise / 100) * 100;
  return { total, roundOff: total - paise };
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite amount: ${value}`);
  // toFixed(6) avoids exponent notation for small/large numbers; extra digits are rounded above.
  return value.toFixed(6);
}
