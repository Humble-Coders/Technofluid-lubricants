import { useCallback, useEffect, useMemo, useState } from "react";
import {
  indiaDate,
  moneyOwedFromRecords,
  openDocumentsFrom,
  salesByProduct,
  stockValue,
  type DocumentForReport,
  type MoneyOwedReport,
  type SalesByProductReport,
  type SalesGroupBy,
  type StockValueReport,
} from "@technofluid/core";
import { getEntityBalances } from "@/services/ledgerService";
import { readActivePurchases, readEntitiesForReport, readPartyMoneyEntries, readPurchasesFrom, readSales, readStockItems } from "@/services/reportService";
import type { SaleRow } from "@/services/saleService";
import type { StockItem } from "@/services/stockService";

/** A report loaded once (no live updates): Refresh reloads it; `asOf` is when its figures were read. */
export type ReportState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T; asOf: Date };

function useOneShot<T>(load: () => Promise<T>, deps: readonly unknown[]): { state: ReportState<T>; refresh: () => void } {
  const [state, setState] = useState<ReportState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    run()
      .then((data) => alive && setState({ status: "ready", data, asOf: new Date() }))
      .catch((e) => alive && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [run, nonce]);
  return { state, refresh: () => setNonce((n) => n + 1) };
}

/**
 * Money owed: every party's balance FROM THE BOOKS (a failure is an error, never ₹0), and
 * our open invoices and bills since 1 April of the previous financial year, each with
 * what's still due by the one paid rule (documentDue).
 */
export function useMoneyOwedReport() {
  return useOneShot<MoneyOwedReport>(async () => {
    const today = indiaDate();
    const from = openDocumentsFrom(today);
    const [balances, entities, sales, purchases, entries] = await Promise.all([getEntityBalances(), readEntitiesForReport(), readSales(from), readPurchasesFrom(from), readPartyMoneyEntries()]);
    const paidWith = (payments: { amountPaise: number; name: string; hlTxnId: string | null }[], synced: boolean) => payments.map((p) => ({ amountPaise: p.amountPaise, name: p.name, inBooks: synced || !!p.hlTxnId }));
    const documents: DocumentForReport[] = [
      ...sales.map((s) => ({
        kind: "INVOICE" as const,
        id: s.id,
        ref: s.invoiceNo,
        partyRef: null,
        entityId: s.customer.entityId,
        partyName: s.customer.name,
        date: s.invoiceDate,
        status: s.status,
        totalPaise: s.totals.grandTotalPaise,
        paidAtCreation: paidWith(s.payments, s.syncStatus === "SYNCED"),
        inBooks: s.invoiceInBooks,
        cancelInBooks: s.cancelSyncStatus === "SYNCED",
      })),
      ...purchases.map((p) => ({
        kind: "BILL" as const,
        id: p.id,
        ref: p.ref,
        partyRef: p.billNo || null,
        entityId: p.supplier.entityId,
        partyName: p.supplier.name,
        date: p.billDate,
        status: p.status,
        totalPaise: p.billTotalPaise,
        paidAtCreation: paidWith(p.payments, p.syncStatus === "SYNCED"),
        inBooks: p.billInBooks,
        cancelInBooks: p.cancelSyncStatus === "SYNCED",
      })),
    ];
    const signed = Object.fromEntries(Object.entries(balances).map(([id, b]) => [id, b.balancePaise]));
    return moneyOwedFromRecords({ balances: signed, entities, documents, entries, today });
  }, []);
}

/** Invoices in [from, to], read once; grouping and the customer filter are applied without reading again. */
export function useSalesReport(from: string, to: string, groupBy: SalesGroupBy, customerEntityId: string | null) {
  const { state, refresh } = useOneShot<SaleRow[]>(() => readSales(from, to), [from, to]);
  const report = useMemo<ReportState<SalesByProductReport & { customers: { entityId: string; name: string }[] }>>(() => {
    if (state.status !== "ready") return state;
    const customers = [...new Map(state.data.map((s) => [s.customer.entityId, { entityId: s.customer.entityId, name: s.customer.name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
    return { status: "ready", asOf: state.asOf, data: { ...salesByProduct(state.data, { groupBy, customerEntityId }), customers } };
  }, [state, groupBy, customerEntityId]);
  return { state: report, refresh };
}

/** Stock value: what's on hand now × the weighted average price over every active purchase line. */
export function useStockValueReport() {
  return useOneShot<StockValueReport & { items: Map<string, StockItem> }>(async () => {
    const [items, purchases] = await Promise.all([readStockItems(), readActivePurchases()]);
    const usable = items.filter((i) => i.unitSet);
    return { ...stockValue(usable, purchases), items: new Map(usable.map((i) => [i.id, i])) };
  }, []);
}
