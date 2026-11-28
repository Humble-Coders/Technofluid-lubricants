import {HttpsError} from "firebase-functions/v2/https";

/**
 * Companies — real separate books, Tally-style (Ansh, 28 Nov 2026; replaces the
 * one-company "Option B"). Each of our companies is one Humble Ledger company.
 *
 *  - companies/{companyId}: our record of one HL company. The login's HOME company is
 *    always "main" — a doc without a companyId means main, so the website and every older
 *    record keep working unchanged. Other companies use their HL company id as doc id.
 *    Server-only writes; admin reads (only admin creates or switches companies —
 *    Sharnya, 28 Nov 2026).
 *  - A company belongs to a LINE: "main" = the main business (sales, purchases, stock,
 *    website orders); any other line is a separate set of money-only books (a person in the
 *    business). A new financial year continues a line from `lineFrom` (its books-begin
 *    date by default): anything dated on or after it goes to the new company. "Make this
 *    the main business company from [date]" = join the main line from that date. Stock is
 *    one continuous pool, whatever the year.
 *  - companyRequests/{requestId}: makes createCompany safe to retry (HL is idempotent on
 *    the same requestId too). Server only.
 */

export const COMPANIES = "companies";
export const COMPANY_REQUESTS = "companyRequests";
export const MAIN_COMPANY_ID = "main";
export const MAIN_LINE = "main";

export type CompanyKind = "BUSINESS" | "MONEY";
export type PendingBills = "ITEMIZED" | "TOTAL";

export interface CompanyDetails {
  mailingName?: string;
  address?: string;
  state?: string;
  country?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
}

/** What routing needs from a company doc. */
export interface CompanyRow {
  id: string;
  line: string;
  /** null = from the beginning (the first company of its line). */
  lineFrom: string | null;
  archived: boolean;
  deleted?: boolean;
}

export const bad = (message: string, code?: string): never => {
  throw new HttpsError("invalid-argument", message, code ? {code} : undefined);
};

export const isDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const kindOfLine = (line: string): CompanyKind => (line === MAIN_LINE ? "BUSINESS" : "MONEY");

/**
 * The company of a line that owns a date: the one with the latest lineFrom on or before
 * it (archived companies still own their dates — HL then refuses the posting, which is
 * what an archived year should do). null when the line has no company for that date.
 */
export function companyForDate<T extends CompanyRow>(companies: T[], line: string, day: string): T | null {
  let best: T | null = null;
  for (const c of companies) {
    if (c.deleted === true || c.line !== line) continue;
    const from = c.lineFrom ?? "";
    if (from > day) continue;
    if (!best || from > (best.lineFrom ?? "")) best = c;
  }
  return best;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-03-31" → "31 Mar 2026". */
export const prettyDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

/** Today in India (YYYY-MM-DD). */
export const indiaToday = () => new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(new Date());

const text = (v: unknown, label: string, max: number, required: boolean): string => {
  if (typeof v !== "string" || !v.trim()) return required ? bad(`${label} is required.`) : "";
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > max) bad(`${label} must be ${max} characters or fewer.`);
  return t;
};

export function detailsOf(raw: unknown): CompanyDetails {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: CompanyDetails = {};
  const put = (k: keyof CompanyDetails, label: string, max: number) => {
    const v = text(d[k], label, max, false);
    if (v) out[k] = v;
  };
  put("mailingName", "Mailing name", 120);
  put("address", "Address", 300);
  put("state", "State", 60);
  put("country", "Country", 60);
  put("pincode", "PIN code", 10);
  put("phone", "Phone", 30);
  put("email", "Email", 120);
  put("website", "Website", 120);
  if (out.pincode && !/^\d{6}$/.test(out.pincode)) bad("The PIN code should be 6 digits.");
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) bad("That email doesn't look right.");
  return out;
}

export interface CreateCompanyInput {
  name: string;
  fyStartMonth: number;
  booksBeginFrom: string | null;
  details: CompanyDetails;
  requestId: string;
  /** Our company id to copy from; null = copy nothing. */
  copyFrom: {
    companyId: string;
    accounts: boolean;
    customers: boolean;
    vendors: boolean;
    members: boolean;
    carry: {asOf: string; pendingBills: PendingBills} | null;
  } | null;
  /** "main" = the main business line; "source" = the copy source's line; "none" = its own (money only). */
  joinsLine: "main" | "source" | "none";
  /** From when it takes over its line (default booksBeginFrom). Ignored for "none". */
  lineFrom: string | null;
}

/** Validates createCompany's input (shape and dates; the server checks the rest). */
export function createCompanyInput(raw: unknown): CreateCompanyInput {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = text(d.name, "Company name", 100, true);
  const fy = d.fyStartMonth === undefined || d.fyStartMonth === null ? 4 : Number(d.fyStartMonth);
  if (!Number.isInteger(fy) || fy < 1 || fy > 12) bad("The financial year must start in a month from 1 to 12.");
  const rawBegin = d.booksBeginFrom === undefined || d.booksBeginFrom === null || d.booksBeginFrom === "" ? null : d.booksBeginFrom;
  if (rawBegin !== null && !isDay(rawBegin)) bad("Books begin must be a date like 2027-04-01.");
  const booksBeginFrom = rawBegin as string | null;
  const requestId = typeof d.requestId === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(d.requestId) ? d.requestId : bad("requestId is missing.");

  let copyFrom: CreateCompanyInput["copyFrom"] = null;
  if (d.copyFrom && typeof d.copyFrom === "object") {
    const c = d.copyFrom as Record<string, unknown>;
    const companyId = typeof c.companyId === "string" && c.companyId.trim() ? c.companyId.trim() : bad("Which company should be copied?");
    let carry: {asOf: string; pendingBills: PendingBills} | null = null;
    if (c.carry && typeof c.carry === "object") {
      const k = c.carry as Record<string, unknown>;
      if (!isDay(k.asOf)) bad("Carry forward needs the closing date, like 2027-03-31.");
      if (k.pendingBills !== "ITEMIZED" && k.pendingBills !== "TOTAL") bad("Choose how unpaid bills come across: each bill, or one total per party.");
      if (!booksBeginFrom) bad("To carry balances forward, set the date the new books begin.", "BOOKS_BEGIN_REQUIRED");
      if ((booksBeginFrom as string) <= (k.asOf as string)) bad("The new books must begin after the closing date.", "BOOKS_BEGIN_NOT_AFTER_AS_OF");
      carry = {asOf: k.asOf as string, pendingBills: k.pendingBills as PendingBills};
    }
    copyFrom = {companyId, accounts: c.accounts === true, customers: c.customers === true, vendors: c.vendors === true, members: c.members === true, carry};
    if (!copyFrom.accounts && !copyFrom.customers && !copyFrom.vendors && !copyFrom.members && !carry) copyFrom = null;
  }

  const joinsLine = d.joinsLine === "main" || d.joinsLine === "source" ? d.joinsLine : "none";
  if (joinsLine === "source" && !copyFrom) bad("To continue another company's books, copy from it.");
  let lineFrom: string | null = null;
  if (joinsLine !== "none") {
    const lf = d.lineFrom === undefined || d.lineFrom === null || d.lineFrom === "" ? booksBeginFrom : d.lineFrom;
    if (!isDay(lf)) bad("Set the date this company takes over from (usually the day its books begin).");
    if (booksBeginFrom && (lf as string) < booksBeginFrom) bad("It can't take over before its own books begin.");
    lineFrom = lf as string;
  }
  return {name, fyStartMonth: fy, booksBeginFrom, details: detailsOf(d.details), requestId, copyFrom, joinsLine, lineFrom};
}

/** A plain message for the HL refusals createCompany can meet. */
export const CREATE_COMPANY_ERROR_TEXT: Record<string, string> = {
  SOURCE_NOT_LOCKED: "Close the old year first (Close year), then carry its balances forward.",
  SOURCE_UNBALANCED: "The old company's books don't balance, so they can't be carried forward. Ask Ansh to check them in Humble Ledger.",
  CURRENCY_MISMATCH: "Balances can't be carried into a company with a different currency.",
  SLUG_TAKEN: "Humble Ledger already has a company with that short name. Try a slightly different name.",
  REQUEST_ID_IN_USE: "This request was already used for something else. Close the form and try again.",
  BOOKS_BEGIN_REQUIRED: "To carry balances forward, set the date the new books begin.",
  BOOKS_BEGIN_NOT_AFTER_AS_OF: "The new books must begin after the closing date.",
  FORBIDDEN: "The app's Humble Ledger login isn't allowed to do this.",
};

/** Owner-only HL actions (alter, archive, reopen) — what to tell the admin when HL says 403. */
export const OWNER_ONLY_TEXT = "Only the company's owner can do this in Humble Ledger (the app signs in as an accountant). Ask Ansh, or do it in the Humble Ledger dashboard.";
