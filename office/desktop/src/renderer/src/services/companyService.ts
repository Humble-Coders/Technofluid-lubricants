import { collection, onSnapshot, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { MAIN_COMPANY_ID, MAIN_LINE } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";
import { newRequestId } from "./stockService";

/**
 * Companies — separate books, one per Humble Ledger company (admin only). Read straight
 * from Firestore (companies/*, admin by the rules); every change goes through a Cloud
 * Function, which asks Humble Ledger first.
 */

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

export interface CompanyRow {
  id: string;
  name: string;
  hlCompanyId: string | null;
  isMain: boolean;
  /** "main" = the main business (sales, purchases, stock); else a money-only line. */
  line: string;
  lineFrom: string | null;
  kind: "BUSINESS" | "MONEY";
  fyStartMonth: number | null;
  booksBeginFrom: string | null;
  lockedThrough: string | null;
  archived: boolean;
  accessLost: boolean;
  madeInHl: boolean;
  /** The app's role in it: OWNER for companies it created (it can alter / archive them), else ACCOUNTANT. */
  hlRole: string | null;
  details: CompanyDetails;
  carriedFrom: { companyId: string; name: string; asOf: string; pendingBills: "ITEMIZED" | "TOTAL" } | null;
  copiedFrom: { companyId: string; name: string } | null;
  info: { transactionCount: number; firstEntryDate: string | null; lastEntryDate: string | null } | null;
  createdBy: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function toRow(id: string, d: DocumentData): CompanyRow {
  const line = str(d.line) ?? (id === MAIN_COMPANY_ID ? MAIN_LINE : id);
  return {
    id,
    name: String(d.name ?? (id === MAIN_COMPANY_ID ? "Main company" : "Company")),
    hlCompanyId: str(d.hlCompanyId),
    isMain: id === MAIN_COMPANY_ID,
    line,
    lineFrom: str(d.lineFrom),
    kind: line === MAIN_LINE ? "BUSINESS" : "MONEY",
    fyStartMonth: typeof d.fyStartMonth === "number" ? d.fyStartMonth : null,
    booksBeginFrom: str(d.booksBeginFrom),
    lockedThrough: str(d.lockedThrough),
    archived: d.archived === true,
    accessLost: d.accessLost === true,
    madeInHl: d.madeInHl === true,
    hlRole: str(d.hlRole),
    details: (d.details && typeof d.details === "object" ? d.details : {}) as CompanyDetails,
    carriedFrom: d.carriedFrom ?? null,
    copiedFrom: d.copiedFrom ?? null,
    info: d.info ? { transactionCount: Number(d.info.transactionCount ?? 0), firstEntryDate: str(d.info.firstEntryDate), lastEntryDate: str(d.info.lastEntryDate) } : null,
    createdBy: str(d.createdBy?.name),
  };
}

/** Main first, then each line's companies newest-first, by name. */
export function sortCompanies(rows: CompanyRow[]): CompanyRow[] {
  return [...rows].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    if ((a.line === MAIN_LINE) !== (b.line === MAIN_LINE)) return a.line === MAIN_LINE ? -1 : 1;
    return a.name.localeCompare(b.name) || (b.lineFrom ?? b.booksBeginFrom ?? "").localeCompare(a.lineFrom ?? a.booksBeginFrom ?? "");
  });
}

/** Every company (Admin), or with `mainBusinessOnly` just the main business's years (Accounts, Stock — the rules allow no more). */
export function watchCompanies(onChange: (rows: CompanyRow[]) => void, onError: (e: Error) => void, mainBusinessOnly = false): Unsubscribe {
  return onSnapshot(
    mainBusinessOnly ? query(collection(db, "companies"), where("line", "==", MAIN_LINE)) : collection(db, "companies"),
    (snap) => onChange(sortCompanies(snap.docs.filter((d) => d.data().deleted !== true).map((d) => toRow(d.id, d.data())))),
    onError,
  );
}

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (await httpsCallable(functions, name)(data)).data as T;
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}

export const refreshCompanies = () => call<{ count: number }>("refreshCompaniesList", {});

export interface CreateCompanyRequest {
  name: string;
  fyStartMonth: number;
  booksBeginFrom: string | null;
  details: CompanyDetails;
  copyFrom: {
    companyId: string;
    accounts: boolean;
    customers: boolean;
    vendors: boolean;
    members: boolean;
    carry: { asOf: string; pendingBills: "ITEMIZED" | "TOTAL" } | null;
  } | null;
  joinsLine: "main" | "source" | "none";
  lineFrom: string | null;
}

export interface Copied {
  accounts: number;
  customers: number;
  vendors: number;
  members: number;
  openingBalanceLines: number;
  pendingBills: number;
  pendingSupplierBills: number;
}

/** Keeps one requestId per open form, so a retry after a timeout never makes a second company. */
export function companyRequestId(): string {
  return newRequestId();
}

export const createCompany = (req: CreateCompanyRequest, requestId: string) =>
  call<{ companyId: string; copied: Copied | null; alreadyDone: boolean }>("createCompany", { ...req, requestId });

export interface CompanyInfo {
  transactionCount: number;
  firstEntryDate: string | null;
  lastEntryDate: string | null;
  carriedForwardAsOf: string | null;
  lockedThrough: string | null;
  lockHistory: { previousDate: string | null; newDate: string | null; changedByRole: string | null; reason: string | null; createdAt: string | null }[];
}

export const getCompanyInfo = (companyId: string) => call<CompanyInfo>("getCompanyInfo", { companyId });
export const updateCompany = (companyId: string, name: string, details: CompanyDetails) => call<{ ok: true }>("updateCompany", { companyId, name, details });
export const deleteCompany = (companyId: string) => call<{ ok: true }>("deleteCompany", { companyId });
export const setCompanyArchived = (companyId: string, archived: boolean) => call<{ ok: true }>("setCompanyArchived", { companyId, archived });
export const closeCompanyYear = (companyId: string, lockedThrough: string) => call<{ lockedThrough: string }>("closeCompanyYear", { companyId, lockedThrough });

export type GroupReportKind = "pnl" | "balance-sheet" | "trial-balance";

export interface GroupReport {
  kind: GroupReportKind;
  from: string | null;
  to: string | null;
  date: string | null;
  sections: { key: string; lines: { name: string; totalPaise: number; byCompany: Record<string, number> }[] }[];
  totals: { key: string; totalPaise: number; byCompany: Record<string, number> }[];
}

export const getGroupReport = (p: { kind: GroupReportKind; companyIds: string[]; from?: string; to?: string; date?: string }) => call<GroupReport>("getGroupReport", p);
