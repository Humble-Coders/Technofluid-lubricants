import { useCallback, useEffect, useMemo, useState } from "react";
import {
  documentDue,
  indiaDate,
  moneyOwed,
  openDocumentsFrom,
  salesByProduct,
  stockValue,
  type MoneyOwedReport,
  type OpenDocumentInput,
  type SalesByProductReport,
  type SalesGroupBy,
  type StockValueReport,
} from "@technofluid/core";
import { getEntityBalances } from "@/services/ledgerService";
import { readActivePurchases, readEntityNames, readLinkedPayments, readPurchasesFrom, readSales, readStockItems } from "@/services/reportService";
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
    const [balances, names, sales, purchases] = await Promise.all([getEntityBalances(), readEntityNames(), readSales(from), readPurchasesFrom(from)]);
    const liveSales = sales.filter((s) => s.status === "ACTIVE");
    const liveBills = purchases.filter((p) => p.status === "ACTIVE");
    const [salePay, billPay] = await Promise.all([
      readLinkedPayments("saleId", liveSales.map((s) => s.id)),
      readLinkedPayments("purchaseId", liveBills.map((p) => p.id)),
    ]);
    const documents: OpenDocumentInput[] = [
      ...liveSales.map((s) => ({
        kind: "INVOICE" as const,
        id: s.id,
        ref: s.invoiceNo,
        partyRef: null,
        entityId: s.customer.entityId,
        partyName: s.customer.name,
        date: s.invoiceDate,
        totalPaise: s.totals.grandTotalPaise,
        paidPaise: documentDue({ totalPaise: s.totals.grandTotalPaise, paidAtCreationPaise: s.paidAtBillingPaise, linked: salePay.get(s.id) ?? [] }).paidPaise,
      })),
      ...liveBills.map((p) => ({
        kind: "BILL" as const,
        id: p.id,
        ref: p.ref,
        partyRef: p.billNo || null,
        entityId: p.supplier.entityId,
        partyName: p.supplier.name,
        date: p.billDate,
        totalPaise: p.billTotalPaise,
        paidPaise: documentDue({ totalPaise: p.billTotalPaise, paidAtCreationPaise: p.paidAtPurchasePaise, linked: billPay.get(p.id) ?? [] }).paidPaise,
      })),
    ];
    const signed = Object.fromEntries(Object.entries(balances).map(([id, b]) => [id, b.balancePaise]));
    return moneyOwed({ balances: signed, names, documents, today });
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
