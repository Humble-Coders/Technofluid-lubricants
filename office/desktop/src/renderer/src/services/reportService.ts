import { collection, getDocs, query, where, type DocumentData } from "firebase/firestore";
import type { EntityForReport, MoneyEntryForReport } from "@technofluid/core";
import { db } from "@/lib/firebase";
import { toPurchase, type PurchaseRow } from "./purchaseService";
import { toSale, type SaleRow } from "./saleService";
import { toStockItem, type StockItem } from "./stockService";
import { lineOf, mainLineOnly } from "./currentCompany";

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

/** Every customer / supplier with its opening balance (archived ones too: they can still owe). */
export async function readEntitiesForReport(): Promise<EntityForReport[]> {
  const snap = await getDocs(query(collection(db, "entities"), where("deleted", "==", false)));
  return snap.docs.map((d) => {
    const x = d.data();
    const o = x.opening;
    return {
      id: d.id,
      name: String(x.name ?? d.id),
      opening:
        o && typeof o.amountPaise === "number"
          ? { amountPaise: o.amountPaise, direction: o.direction === "payable" ? "payable" : "receivable", asOf: String(o.asOf ?? ""), posted: o.posted === true }
          : null,
    };
  });
}

const side = (r: DocumentData | undefined) => ({ kind: String(r?.kind ?? ""), entityId: typeof r?.entityId === "string" ? r.entityId : undefined, name: typeof r?.name === "string" ? r.name : undefined });

/**
 * Every money entry with a customer / supplier on either side (two single-field queries),
 * any date: payments against invoices and bills, advances, refunds, corrections, transfers
 * and the mirrors of reversed ones.
 */
export async function readPartyMoneyEntries(): Promise<MoneyEntryForReport[]> {
  // Invoices and bills are the main business's: its money records only (Accounts may read no others).
  const line = mainLineOnly() ? [where("line", "==", "main")] : [];
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, "moneyEntries"), where("from.kind", "==", "PARTY"), ...line)),
    getDocs(query(collection(db, "moneyEntries"), where("to.kind", "==", "PARTY"), ...line)),
  ]);
  const out = new Map<string, MoneyEntryForReport>();
  for (const d of [...a.docs, ...b.docs]) {
    const x = d.data();
    if (x.deleted === true || out.has(d.id) || lineOf(x) !== "main") continue;
    out.set(d.id, {
      id: d.id,
      from: side(x.from),
      to: side(x.to),
      amountPaise: Number(x.amountPaise ?? 0),
      businessDay: String(x.businessDay ?? ""),
      note: typeof x.note === "string" ? x.note : null,
      isCorrection: x.isCorrection === true,
      saleId: typeof x.saleId === "string" && x.saleId ? x.saleId : null,
      purchaseId: typeof x.purchaseId === "string" && x.purchaseId ? x.purchaseId : null,
      reversesEntryId: typeof x.reversesEntryId === "string" ? x.reversesEntryId : null,
      reversedByEntryId: typeof x.reversedByEntryId === "string" ? x.reversedByEntryId : null,
      syncStatus: String(x.syncStatus ?? "PENDING"),
      inBooks: x.syncStatus === "SYNCED" || (typeof x.hlTxnId === "string" && x.hlTxnId !== ""),
    });
  }
  return [...out.values()];
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
