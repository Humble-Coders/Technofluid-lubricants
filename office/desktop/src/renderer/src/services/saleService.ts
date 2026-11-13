import { FirebaseError } from "firebase/app";
import { collection, doc, limit, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { invoiceNumber, type CompanyProfile, type EntityAddress, type PriceTier, type PricedSaleLine, type SaleFreight, type SaleLineInput, type SalePaymentInput, type SaleDispatch, type SaleShipTo, type SaleTotals, type WalkInBuyer } from "@technofluid/core";
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
  /** buyer: who bought, on a walk-in sale (older sales have none). */
  customer: { entityId: string; name: string; gstin: string | null; address: EntityAddress | null; isWalkIn: boolean; priceTier: PriceTier | null; buyer?: WalkInBuyer | null };
  placeOfSupply: string;
  /** Transport, vehicle, station, e-way bill (older sales: null). */
  dispatch: SaleDispatch | null;
  /** Where the goods went, when not the billing address. */
  shipTo: SaleShipTo | null;
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
  /** The invoice itself is in the books (also true when a later payment couldn't be saved). */
  invoiceInBooks: boolean;
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
    customer: { ...d.customer, buyer: d.customer?.buyer ?? null },
    placeOfSupply: String(d.placeOfSupply ?? ""),
    dispatch: d.dispatch ?? null,
    shipTo: d.shipTo ?? null,
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
    invoiceInBooks: d.syncStatus === "SYNCED" || (typeof d.hlInvoiceId === "string" && d.hlInvoiceId !== ""),
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

/**
 * A preview of the number the next invoice of a financial year will get ("TF/2026-27/0006").
 * The real number is given by createSale when the sale is saved, so two people billing at
 * once may see the same preview. Invoice dates never go backwards within a year, so the
 * highest number is on the latest date: watch the latest invoice, then every invoice of
 * that day (plain one-field queries — no extra index needed).
 */
export function watchNextInvoiceNo(fy: string, fallbackPrefix: string, onChange: (no: string | null) => void): Unsubscribe {
  const start = Number(fy.slice(0, 4));
  const from = `${start}-04-01`;
  const to = `${start + 1}-03-31`;
  const next = (prefix: string, seq: number) => {
    try {
      return invoiceNumber(prefix, fy, seq);
    } catch {
      return null;
    }
  };
  let unsubDay: Unsubscribe | null = null;
  let day: string | null = null;
  const unsubLatest = onSnapshot(
    query(collection(db, "sales"), where("invoiceDate", ">=", from), where("invoiceDate", "<=", to), orderBy("invoiceDate", "desc"), limit(1)),
    (snap) => {
      const latest = snap.docs[0]?.data();
      const d = latest ? String(latest.invoiceDate ?? "") : null;
      if (d === day && unsubDay) return;
      unsubDay?.();
      unsubDay = null;
      day = d;
      if (!d) return onChange(next(fallbackPrefix, 1));
      unsubDay = onSnapshot(
        query(collection(db, "sales"), where("invoiceDate", "==", d)),
        (s2) => {
          const ofYear = s2.docs.map((x) => x.data()).filter((x) => x.fy === fy && Number.isInteger(x.seq));
          if (ofYear.length === 0) return onChange(next(fallbackPrefix, 1));
          const top = ofYear.reduce((a, b) => (b.seq > a.seq ? b : a));
          const prefix = String(top.invoiceNo ?? "").split("/")[0] || fallbackPrefix;
          onChange(next(prefix, top.seq + 1));
        },
        () => onChange(null),
      );
    },
    () => onChange(null),
  );
  return () => {
    unsubLatest();
    unsubDay?.();
  };
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
  /** Walk-in only: who bought (printed on the invoice). */
  walkInBuyer?: WalkInBuyer | null;
  dispatch?: SaleDispatch | null;
  shipTo?: SaleShipTo | null;
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
