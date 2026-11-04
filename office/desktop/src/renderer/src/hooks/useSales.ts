import { useEffect, useMemo, useState } from "react";
import { isCancelled, paidState, type CompanyProfile, type PaidState } from "@technofluid/core";
import { watchMoneyEntryStatuses, watchSalePayments, type MoneyEntryRow, type SyncStatus } from "@/services/moneyService";
import { usingEmulators } from "@/lib/firebase";
import { watchCompany, watchRealBooks, watchSale, watchSales, type SaleRow } from "@/services/saleService";
import type { LoadState } from "./useProducts";

export function useCompany(): LoadState<CompanyProfile | null> {
  const [state, setState] = useState<LoadState<CompanyProfile | null>>({ status: "loading" });
  useEffect(
    () =>
      watchCompany(
        (data) => setState({ status: "ready", data }),
        (e) => setState({ status: "error", message: e.message }),
      ),
    [],
  );
  return state;
}

/** Test setup posting to the REAL books (`npm run emulators:real-books`)? Never true outside the emulators. */
export function useRealBooks(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => (usingEmulators ? watchRealBooks(setOn) : undefined), []);
  return on;
}

export function useSales(from: string, to: string): LoadState<SaleRow[]> {
  const [state, setState] = useState<LoadState<SaleRow[]>>({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    return watchSales(
      from,
      to,
      (data) => setState({ status: "ready", data }),
      (e) => setState({ status: "error", message: e.message }),
    );
  }, [from, to]);
  return state;
}

export function useSale(saleId: string | undefined): LoadState<SaleRow | null> {
  const [state, setState] = useState<LoadState<SaleRow | null>>({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    if (!saleId) return;
    return watchSale(
      saleId,
      (data) => setState({ status: "ready", data }),
      (e) => setState({ status: "error", message: e.message }),
    );
  }, [saleId]);
  return state;
}

export interface SalePaid {
  /** At billing + money received against the invoice since (a reversed one stops counting once its reversal is in the books). */
  paidPaise: number;
  duePaise: number;
  state: PaidState | "CANCELLED";
  /** Money received against the invoice after billing, each with its reversal's status. */
  later: MoneyEntryRow[];
}

/**
 * What has been paid on each of these invoices — worked out from our own records (paid at
 * billing + linked money received), never stored. Mirrors of reversed payments are
 * watched by id, so a reversal only counts once it is in the books.
 */
export function useSalesPaid(sales: SaleRow[]): Map<string, SalePaid> {
  const ids = useMemo(() => sales.map((s) => s.id).sort().join(","), [sales]);
  const [entries, setEntries] = useState<MoneyEntryRow[]>([]);
  useEffect(() => {
    setEntries([]);
    if (!ids) return;
    return watchSalePayments(ids.split(","), setEntries);
  }, [ids]);
  const mirrorIds = useMemo(() => [...new Set(entries.flatMap((e) => (e.reversedByEntryId ? [e.reversedByEntryId] : [])))].sort().join(","), [entries]);
  const [mirrors, setMirrors] = useState<Record<string, SyncStatus>>({});
  useEffect(() => {
    setMirrors({});
    if (!mirrorIds) return;
    return watchMoneyEntryStatuses(mirrorIds.split(","), setMirrors);
  }, [mirrorIds]);

  return useMemo(() => {
    const out = new Map<string, SalePaid>();
    for (const s of sales) {
      const later = entries
        .filter((e) => e.saleId === s.id && !e.reversesEntryId)
        .map((e) => (e.reversedByEntryId ? { ...e, mirrorStatus: mirrors[e.reversedByEntryId] ?? null } : e));
      const laterPaise = later.filter((e) => !isCancelled(e, e.mirrorStatus)).reduce((sum, e) => sum + e.amountPaise, 0);
      const paidPaise = s.paidAtBillingPaise + laterPaise;
      const total = s.totals.grandTotalPaise;
      out.set(s.id, {
        paidPaise,
        duePaise: Math.max(total - paidPaise, 0),
        state: s.status === "CANCELLED" ? "CANCELLED" : paidState(total, paidPaise),
        later,
      });
    }
    return out;
  }, [sales, entries, mirrors]);
}
