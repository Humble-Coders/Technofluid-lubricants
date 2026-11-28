import { MAIN_COMPANY_ID, MAIN_LINE } from "@technofluid/core";

/**
 * The company the app is working in (Tally's "current company"). Only Admin switches
 * (Sharnya, 28 Nov 2026); everyone else always works in the main company. The services
 * read it here so every call and every list follows the switch without passing it around;
 * CompanyProvider sets it and remounts the screens when it changes.
 */
let current = { companyId: MAIN_COMPANY_ID, line: MAIN_LINE, admin: false };

export const currentCompanyId = () => current.companyId;
export const currentLine = () => current.line;
export const inMainCompany = () => current.companyId === MAIN_COMPANY_ID;

export function setCurrentCompany(companyId: string, line: string, admin: boolean) {
  current = { companyId, line, admin };
}

/** Admin reads every company's records; Accounts only the main business's (the rules say so too). */
export const seesAllCompanies = () => current.admin;
/** Query constraint for money records / cash & bank: Accounts must ask for the main business's only. */
export const mainLineOnly = () => !current.admin;

/**
 * Whether a money record shows in the current view: Admin sees the company it's in;
 * Accounts sees the whole main business (every financial year).
 */
export const inMoneyView = (d: { companyId?: unknown; line?: unknown }) => (current.admin ? companyOf(d) === current.companyId : lineOf(d) === MAIN_LINE);

/**
 * Whether a sale / purchase shows: Admin in a main-business company sees that company's;
 * otherwise (Accounts, or Admin in a money-only company) the whole main business.
 */
export const inSalesView = (d: { companyId?: unknown }) => (current.admin && current.line === MAIN_LINE ? companyOf(d) === current.companyId : true);

/** A record's company (a record without one belongs to main). */
export const companyOf = (d: { companyId?: unknown }) => (typeof d.companyId === "string" && d.companyId ? d.companyId : MAIN_COMPANY_ID);
/** A register's line of companies (missing = the main business). */
export const lineOf = (d: { line?: unknown }) => (typeof d.line === "string" && d.line ? d.line : MAIN_LINE);

const KEY = "office.company";
export function rememberedCompany(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function rememberCompany(companyId: string) {
  try {
    localStorage.setItem(KEY, companyId);
  } catch {
    // A convenience only.
  }
}
