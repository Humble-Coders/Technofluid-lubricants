import { FirebaseError } from "firebase/app";
import { collection, doc, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { PricedPurchaseLine, PurchaseFreight, PurchaseLineInput, PurchasePaymentInput, PurchaseSupplyType, PurchaseTotals } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";
import type { SyncStatus } from "./moneyService";
import { newRequestId } from "./stockService";

/**
 * Purchases (supplier bills). Read straight from Firestore (Admin + Accounts, by the
 * rules); every change goes through a Cloud Function, which re-prices the bill (what the
 * app shows is a preview), numbers it PB/…, brings the stock in and posts it to the books.
 */

export interface PurchaseRow {
  id: string;
  ref: string;
  billNo: string;
  billDate: string;
  supplier: { entityId: string; name: string; gstin: string | null; stateCode: string | null };
  supplyType: PurchaseSupplyType;
  lines: (PricedPurchaseLine & { lineCostPaise?: number })[];
  freight: PurchaseFreight | null;
  totals: PurchaseTotals;
  billTotalPaise: number;
  payments: { registerId: string; kind: "CASH" | "BANK"; name: string; amountPaise: number; hlTxnId: string | null }[];
  paidAtPurchasePaise: number;
  stockAlreadyCounted: boolean;
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

function toPurchase(id: string, d: DocumentData): PurchaseRow {
  return {
    id,
    ref: String(d.ref ?? ""),
    billNo: String(d.billNo ?? ""),
    billDate: String(d.billDate ?? ""),
    supplier: { entityId: String(d.supplier?.entityId ?? ""), name: String(d.supplier?.name ?? ""), gstin: d.supplier?.gstin ?? null, stateCode: d.supplier?.stateCode ?? null },
    supplyType: d.supplyType === "INTER" || d.supplyType === "NONE" ? d.supplyType : "INTRA",
    lines: Array.isArray(d.lines) ? d.lines : [],
    freight: d.freight ?? null,
    totals: d.totals,
    billTotalPaise: Number(d.billTotalPaise ?? d.totals?.billTotalPaise ?? 0),
    payments: Array.isArray(d.payments) ? d.payments : [],
    paidAtPurchasePaise: Number(d.paidAtPurchasePaise ?? 0),
    stockAlreadyCounted: d.stockAlreadyCounted === true,
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

/** Bills dated in [from, to], newest first. */
export function watchPurchases(from: string, to: string, onChange: (rows: PurchaseRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "purchases"), where("billDate", ">=", from), where("billDate", "<=", to), orderBy("billDate", "desc")),
    (snap) =>
      onChange(
        snap.docs
          .filter((d) => d.data().deleted !== true)
          .map((d) => toPurchase(d.id, d.data({ serverTimestamps: "estimate" })))
          .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.ref.localeCompare(a.ref, undefined, { numeric: true })),
      ),
    onError,
  );
}

export function watchPurchase(id: string, onChange: (row: PurchaseRow | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, "purchases", id), (snap) => onChange(snap.exists() ? toPurchase(snap.id, snap.data({ serverTimestamps: "estimate" })) : null), onError);
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

export interface CreatePurchaseInput {
  supplierEntityId: string;
  billNo: string;
  billDate: string;
  lines: PurchaseLineInput[];
  freightPaise: number;
  roundOffPaise: number;
  /** The total printed on the supplier's bill — the save is refused unless ours matches. */
  supplierBillTotalPaise: number;
  payments: PurchasePaymentInput[];
  stockAlreadyCounted: boolean;
  note: string | null;
}

export interface CreatePurchaseResult {
  purchaseId: string;
  ref: string;
  billTotalPaise: number;
}

/** One request id per attempt the person makes — a double click or a retry can't record the bill twice. */
export function createPurchase(requestId: string, input: CreatePurchaseInput) {
  return call<unknown, CreatePurchaseResult>("createPurchase", { requestId, ...input });
}

export function cancelPurchase(purchaseId: string, reason: string) {
  return call<unknown, { purchaseId: string; ref: string; belowZero: { itemId: string; name: string; onHandMilli: number }[] }>("cancelPurchase", { requestId: newRequestId(), purchaseId, reason });
}

export function retryPurchaseSync(purchaseId: string) {
  return call<unknown, { purchaseId: string }>("retryPurchaseSync", { purchaseId });
}
