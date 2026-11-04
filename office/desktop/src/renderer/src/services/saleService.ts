import { FirebaseError } from "firebase/app";
import { collection, doc, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { CompanyProfile, EntityAddress, PriceTier, PricedSaleLine, SaleFreight, SaleLineInput, SalePaymentInput, SaleTotals } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";
import type { SyncStatus } from "./moneyService";
import { newRequestId } from "./stockService";

/**
 * Sales & invoices. Read straight from Firestore (Admin + Accounts, by the rules); every
 * change goes through a Cloud Function, which numbers the invoice, prices it again (what
 * the app shows is a preview), takes the stock out and posts it to the books.
 */

export interface SaleRow {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customer: { entityId: string; name: string; gstin: string | null; address: EntityAddress | null; isWalkIn: boolean; priceTier: PriceTier | null };
  placeOfSupply: string;
  seller: Omit<CompanyProfile, "invoicePrefix">;
  lines: PricedSaleLine[];
  freight: SaleFreight | null;
  totals: SaleTotals;
  missingHsn: string[];
  payments: { registerId: string; kind: "CASH" | "BANK"; name: string; amountPaise: number; hlTxnId: string | null }[];
  paidAtBillingPaise: number;
  note: string | null;
  status: "ACTIVE" | "CANCELLED";
  cancel: { reason: string; by: string; day: string } | null;
  syncStatus: SyncStatus;
  hlSyncError: string | null;
  cancelSyncStatus: SyncStatus | null;
  cancelSyncError: string | null;
  createdBy: string;
  createdAt: Date | null;
}

const date = (x: unknown): Date | null =>
  x && typeof (x as { toDate?: () => Date }).toDate === "function" ? (x as { toDate: () => Date }).toDate() : null;
const status = (x: unknown): SyncStatus => (x === "SYNCED" || x === "FAILED" ? x : "PENDING");

function toSale(id: string, d: DocumentData): SaleRow {
  return {
    id,
    invoiceNo: String(d.invoiceNo ?? ""),
    invoiceDate: String(d.invoiceDate ?? ""),
    customer: d.customer,
    placeOfSupply: String(d.placeOfSupply ?? ""),
    seller: d.seller,
    lines: Array.isArray(d.lines) ? d.lines : [],
    freight: d.freight ?? null,
    totals: d.totals,
    missingHsn: Array.isArray(d.missingHsn) ? d.missingHsn : [],
    payments: Array.isArray(d.payments) ? d.payments : [],
    paidAtBillingPaise: Number(d.paidAtBillingPaise ?? 0),
    note: typeof d.note === "string" ? d.note : null,
    status: d.status === "CANCELLED" ? "CANCELLED" : "ACTIVE",
    cancel: d.cancel ? { reason: String(d.cancel.reason ?? ""), by: String(d.cancel.by?.name ?? "Someone"), day: String(d.cancel.day ?? "") } : null,
    syncStatus: status(d.syncStatus),
    hlSyncError: typeof d.hlSyncError === "string" ? d.hlSyncError : null,
    cancelSyncStatus: d.cancelSyncStatus ? status(d.cancelSyncStatus) : null,
    cancelSyncError: typeof d.cancelSyncError === "string" ? d.cancelSyncError : null,
    createdBy: String(d.createdBy?.name ?? "Someone"),
    createdAt: date(d.createdAt),
  };
}

/** Invoices dated in [from, to], newest first. */
export function watchSales(from: string, to: string, onChange: (rows: SaleRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "sales"), where("invoiceDate", ">=", from), where("invoiceDate", "<=", to), orderBy("invoiceDate", "desc")),
    (snap) =>
      onChange(
        snap.docs
          .filter((d) => d.data().deleted !== true)
          .map((d) => toSale(d.id, d.data({ serverTimestamps: "estimate" })))
          .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNo.localeCompare(a.invoiceNo, undefined, { numeric: true })),
      ),
    onError,
  );
}

export function watchSale(saleId: string, onChange: (row: SaleRow | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, "sales", saleId), (snap) => onChange(snap.exists() ? toSale(snap.id, snap.data({ serverTimestamps: "estimate" })) : null), onError);
}

/** Who the seller is (null until an Admin fills it in). */
export function watchCompany(onChange: (c: CompanyProfile | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, "officeSettings", "company"), (snap) => onChange(snap.exists() ? (snap.data() as CompanyProfile) : null), onError);
}

/**
 * Emulators only: true while they post to Technofluid's REAL books
 * (`npm run emulators:real-books`). Readable by Admin + Accounts; anyone else sees false.
 */
export function watchRealBooks(onChange: (on: boolean) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "officeSettings", "emulatorMode"),
    (snap) => onChange(snap.data()?.realBooks === true),
    () => onChange(false),
  );
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "functions/unavailable" && /books/i.test(error.message)) {
      throw new Error(error.message.replace(/\s*\[\d{3}\]$/, ""));
    }
    throw new Error(await friendlyError(error));
  }
}

export interface CreateSaleInput {
  customerEntityId: string;
  invoiceDate: string;
  lines: SaleLineInput[];
  freightPaise: number;
  payments: SalePaymentInput[];
  note: string | null;
}

export interface CreateSaleResult {
  saleId: string;
  invoiceNo: string;
  grandTotalPaise: number;
  belowZero: { itemId: string; name: string; onHandMilli: number }[];
  missingHsn: string[];
}

/** One request id per attempt the person makes — a double click or a retry can't bill twice. */
export function createSale(requestId: string, input: CreateSaleInput) {
  return call<unknown, CreateSaleResult>("createSale", { requestId, ...input });
}

export function cancelSale(saleId: string, reason: string) {
  return call<unknown, { saleId: string; invoiceNo: string }>("cancelSale", { requestId: newRequestId(), saleId, reason });
}

export function retrySaleSync(saleId: string) {
  return call<unknown, { saleId: string }>("retrySaleSync", { saleId });
}

export function saveCompanyProfile(p: Omit<CompanyProfile, "stateCode">) {
  return call<unknown, { saved: boolean; stateCode: string }>("saveCompanyProfile", p);
}
