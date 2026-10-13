import { assertPaise, percentOfPaise, roundOffToRupee, sumPaise, type Paise } from "./money";

/**
 * GST state codes (first two digits of a GSTIN; also the "place of supply").
 * Same state as the seller → CGST + SGST (each half the rate). Different state → IGST.
 */
export const GST_STATES: Readonly<Record<string, string>> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export function isValidStateCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(GST_STATES, code);
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Upper-cases and strips spaces; does not validate. */
export function normalizeGstin(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** The official GSTIN check character for the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i] ?? "");
    if (value < 0) throw new RangeError(`Invalid GSTIN character "${first14[i]}"`);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

export type GstinCheck =
  | { valid: true; gstin: string; stateCode: string; stateName: string; pan: string }
  | { valid: false; gstin: string; reason: string };

/** Shape + state code + checksum. Catches almost every typo before it reaches an invoice. */
export function checkGstin(input: string): GstinCheck {
  const gstin = normalizeGstin(input);
  if (gstin.length !== 15) return { valid: false, gstin, reason: "A GSTIN has 15 characters" };
  if (!GSTIN_SHAPE.test(gstin)) return { valid: false, gstin, reason: "This does not look like a GSTIN" };
  const stateCode = gstin.slice(0, 2);
  if (!isValidStateCode(stateCode)) return { valid: false, gstin, reason: `Unknown state code ${stateCode}` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { valid: false, gstin, reason: "Check digit does not match — probably a typo" };
  }
  return { valid: true, gstin, stateCode, stateName: GST_STATES[stateCode]!, pan: gstin.slice(2, 12) };
}

export type SupplyType = "INTRA_STATE" | "INTER_STATE";

export function supplyType(sellerStateCode: string, placeOfSupplyStateCode: string): SupplyType {
  if (!isValidStateCode(sellerStateCode)) throw new RangeError(`Unknown seller state ${sellerStateCode}`);
  if (!isValidStateCode(placeOfSupplyStateCode)) throw new RangeError(`Unknown place of supply ${placeOfSupplyStateCode}`);
  return sellerStateCode === placeOfSupplyStateCode ? "INTRA_STATE" : "INTER_STATE";
}

export interface TaxableLine {
  /** Value before tax, after any line discount. */
  taxablePaise: Paise;
  /** GST rate in basis points: 18% = 1800. */
  gstRateBp: number;
}

export interface LineTax {
  taxablePaise: Paise;
  gstRateBp: number;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
}

/**
 * Tax on one line. Intra-state: CGST and SGST are each computed at half the rate and
 * rounded separately, so they always print as equal amounts on the invoice.
 */
export function taxLine(line: TaxableLine, type: SupplyType): LineTax {
  assertPaise(line.taxablePaise, "taxable value");
  if (!Number.isInteger(line.gstRateBp) || line.gstRateBp < 0 || line.gstRateBp % 2 !== 0) {
    throw new RangeError(`GST rate must be even whole basis points (e.g. 1800), got ${line.gstRateBp}`);
  }
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (type === "INTRA_STATE") {
    cgstPaise = percentOfPaise(line.taxablePaise, line.gstRateBp / 2);
    sgstPaise = cgstPaise;
  } else {
    igstPaise = percentOfPaise(line.taxablePaise, line.gstRateBp);
  }
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  return {
    taxablePaise: line.taxablePaise,
    gstRateBp: line.gstRateBp,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    totalPaise: line.taxablePaise + taxPaise,
  };
}

export interface InvoiceTotals {
  supplyType: SupplyType;
  lines: LineTax[];
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  taxPaise: Paise;
  /** Before rounding to the rupee. */
  exactTotalPaise: Paise;
  roundOffPaise: Paise;
  /** What the customer pays. */
  grandTotalPaise: Paise;
  /** Tax per rate, for the invoice's tax summary and GST returns. */
  byRate: Array<{ gstRateBp: number; taxablePaise: Paise; cgstPaise: Paise; sgstPaise: Paise; igstPaise: Paise }>;
}

/**
 * Totals for a whole invoice: per-line tax, sums, tax-by-rate summary and the rupee
 * round-off. Freight or other charges are passed in as ordinary lines with their rate.
 */
export function invoiceTotals(
  lines: readonly TaxableLine[],
  sellerStateCode: string,
  placeOfSupplyStateCode: string,
  options: { roundToRupee?: boolean } = {},
): InvoiceTotals {
  const type = supplyType(sellerStateCode, placeOfSupplyStateCode);
  const taxed = lines.map((line) => taxLine(line, type));
  const taxablePaise = sumPaise(taxed.map((l) => l.taxablePaise));
  const cgstPaise = sumPaise(taxed.map((l) => l.cgstPaise));
  const sgstPaise = sumPaise(taxed.map((l) => l.sgstPaise));
  const igstPaise = sumPaise(taxed.map((l) => l.igstPaise));
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  const exactTotalPaise = taxablePaise + taxPaise;
  const { total, roundOff } =
    options.roundToRupee === false ? { total: exactTotalPaise, roundOff: 0 } : roundOffToRupee(exactTotalPaise);

  const rates = new Map<number, InvoiceTotals["byRate"][number]>();
  for (const l of taxed) {
    const row = rates.get(l.gstRateBp) ?? { gstRateBp: l.gstRateBp, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    row.taxablePaise += l.taxablePaise;
    row.cgstPaise += l.cgstPaise;
    row.sgstPaise += l.sgstPaise;
    row.igstPaise += l.igstPaise;
    rates.set(l.gstRateBp, row);
  }

  return {
    supplyType: type,
    lines: taxed,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    exactTotalPaise,
    roundOffPaise: roundOff,
    grandTotalPaise: total,
    byRate: [...rates.values()].sort((a, b) => a.gstRateBp - b.gstRateBp),
  };
}

/** "18%" from 1800, "2.5%" from 250. */
export function formatRate(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
}
