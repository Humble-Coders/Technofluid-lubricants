import { collection, documentId, getDocs, query, where, type DocumentData } from "firebase/firestore";
import type { LinkedPaymentState } from "@technofluid/core";
import { db } from "@/lib/firebase";
import { toPurchase, type PurchaseRow } from "./purchaseService";
import { toSale, type SaleRow } from "./saleService";
import { toStockItem, type StockItem } from "./stockService";

/**
 * Reports (brief: docs/office/reports-brief.md) — ONE-SHOT reads (no listeners), all
 * single-field queries (one equality OR one range), so no extra index is needed. Nothing
 * here writes. Sales, purchases and money entries are readable by Admin + Accounts only
 * (the rules); party balances come from the books through getEntityBalances.
 */

const live = (d: DocumentData) => d.deleted !== true;

/** Invoices dated from `from` (and up to `to` when given). */
export async function readSales(from: string, to?: string): Promise<SaleRow[]> {
  const q = to
    ? query(collection(db, "sales"), where("invoiceDate", ">=", from), where("invoiceDate", "<=", to))
    : query(collection(db, "sales"), where("invoiceDate", ">=", from));
  const snap = await getDocs(q);
  return snap.docs.filter((d) => live(d.data())).map((d) => toSale(d.id, d.data({ serverTimestamps: "estimate" })));
}

/** Supplier bills dated from `from`. */
export async function readPurchasesFrom(from: string): Promise<PurchaseRow[]> {
  const snap = await getDocs(query(collection(db, "purchases"), where("billDate", ">=", from)));
  return snap.docs.filter((d) => live(d.data())).map((d) => toPurchase(d.id, d.data({ serverTimestamps: "estimate" })));
}

/** Every active supplier bill, any date (for the average purchase price). */
export async function readActivePurchases(): Promise<PurchaseRow[]> {
  const snap = await getDocs(query(collection(db, "purchases"), where("status", "==", "ACTIVE")));
  return snap.docs.filter((d) => live(d.data())).map((d) => toPurchase(d.id, d.data({ serverTimestamps: "estimate" })));
}

export async function readStockItems(): Promise<StockItem[]> {
  const snap = await getDocs(query(collection(db, "stockItems"), where("deleted", "==", false)));
  return snap.docs.map((d) => toStockItem(d.id, d.data()));
}

/** entityId → name, for every customer / supplier (archived ones too: they can still owe). */
export async function readEntityNames(): Promise<Record<string, string>> {
  const snap = await getDocs(query(collection(db, "entities"), where("deleted", "==", false)));
  return Object.fromEntries(snap.docs.map((d) => [d.id, String(d.data().name ?? d.id)]));
}

const chunks = <T,>(xs: readonly T[], n = 30): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/**
 * Money linked to these invoices / bills, each with its reversal's status, grouped by
 * document id — the input to documentDue (the same rule the screens and the server use).
 */
export async function readLinkedPayments(field: "saleId" | "purchaseId", ids: readonly string[]): Promise<Map<string, LinkedPaymentState[]>> {
  const rows: DocumentData[] = [];
  for (const chunk of chunks(ids)) {
    const snap = await getDocs(query(collection(db, "moneyEntries"), where(field, "in", chunk)));
    for (const d of snap.docs) rows.push(d.data());
  }
  const mirrorIds = [...new Set(rows.flatMap((r) => (typeof r.reversedByEntryId === "string" && r.reversedByEntryId ? [r.reversedByEntryId] : [])))];
  const mirrorStatus = new Map<string, string>();
  for (const chunk of chunks(mirrorIds)) {
    const snap = await getDocs(query(collection(db, "moneyEntries"), where(documentId(), "in", chunk)));
    for (const d of snap.docs) mirrorStatus.set(d.id, String(d.data().syncStatus ?? ""));
  }
  const out = new Map<string, LinkedPaymentState[]>();
  for (const r of rows) {
    const id = String(r[field] ?? "");
    const list = out.get(id) ?? [];
    list.push({
      amountPaise: Number(r.amountPaise ?? 0),
      deleted: r.deleted === true,
      reversesEntryId: typeof r.reversesEntryId === "string" ? r.reversesEntryId : null,
      reversedByEntryId: typeof r.reversedByEntryId === "string" ? r.reversedByEntryId : null,
      mirrorStatus: typeof r.reversedByEntryId === "string" ? (mirrorStatus.get(r.reversedByEntryId) ?? null) : null,
    });
    out.set(id, list);
  }
  return out;
}

/**
 * Saves a CSV through the desktop app's save dialog (Excel-friendly UTF-8). In a plain
 * browser (development only) it downloads instead. Resolves false when cancelled.
 */
export async function saveCsv(fileName: string, text: string): Promise<boolean> {
  if (window.office?.saveCsv) {
    const r = await window.office.saveCsv({ fileName, text });
    if (!r.ok) throw new Error(r.message);
    return !r.cancelled;
  }
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
