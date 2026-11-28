import { useEffect, useMemo, useState } from "react";
import { documentDue, paidState } from "@technofluid/core";
import { watchMoneyEntryStatuses, watchPurchasePayments, type MoneyEntryRow, type SyncStatus } from "@/services/moneyService";
import { watchPurchase, watchPurchases, type PurchaseRow } from "@/services/purchaseService";
import type { SalePaid } from "./useSales";
import type { LoadState } from "./useProducts";
import { useLoadingSignal } from "@/lib/screenLoading";

export function usePurchases(from: string, to: string): LoadState<PurchaseRow[]> {
  const [state, setState] = useState<LoadState<PurchaseRow[]>>({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    return watchPurchases(
      from,
      to,
      (data) => setState({ status: "ready", data }),
      (e) => setState({ status: "error", message: e.message }),
    );
  }, [from, to]);
  useLoadingSignal(state.status === "loading");
  return state;
}

export function usePurchase(id: string | undefined): LoadState<PurchaseRow | null> {
  const [state, setState] = useState<LoadState<PurchaseRow | null>>({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    if (!id) return;
    return watchPurchase(
      id,
      (data) => setState({ status: "ready", data }),
      (e) => setState({ status: "error", message: e.message }),
    );
  }, [id]);
  useLoadingSignal(state.status === "loading" && Boolean(id));
  return state;
}

/** Same shape as an invoice's: paid with the bill + money paid against it since. */
export type PurchasePaid = SalePaid;

/**
 * What has been paid on each of these bills — worked out from our own records (paid with
 * the bill + linked money paid), never stored. A reversed payment stops counting once its
 * reversal is in the books (the same rule recordMoneyEntry uses for "still due").
 */
export function usePurchasesPaid(purchases: PurchaseRow[]): Map<string, PurchasePaid> {
  const ids = useMemo(() => purchases.map((p) => p.id).sort().join(","), [purchases]);
  const [entries, setEntries] = useState<MoneyEntryRow[]>([]);
  useEffect(() => {
    setEntries([]);
    if (!ids) return;
    return watchPurchasePayments(ids.split(","), setEntries);
  }, [ids]);
  const mirrorIds = useMemo(() => [...new Set(entries.flatMap((e) => (e.reversedByEntryId ? [e.reversedByEntryId] : [])))].sort().join(","), [entries]);
  const [mirrors, setMirrors] = useState<Record<string, SyncStatus>>({});
  useEffect(() => {
    setMirrors({});
    if (!mirrorIds) return;
    return watchMoneyEntryStatuses(mirrorIds.split(","), setMirrors);
  }, [mirrorIds]);

  return useMemo(() => {
    const out = new Map<string, PurchasePaid>();
    for (const p of purchases) {
      const later = entries
        .filter((e) => e.purchaseId === p.id && !e.reversesEntryId)
        .map((e) => (e.reversedByEntryId ? { ...e, mirrorStatus: mirrors[e.reversedByEntryId] ?? null } : e));
      const { paidPaise, duePaise } = documentDue({ totalPaise: p.billTotalPaise, paidAtCreationPaise: p.paidAtPurchasePaise, linked: later });
      out.set(p.id, { paidPaise, duePaise, state: p.status === "CANCELLED" ? "CANCELLED" : paidState(p.billTotalPaise, paidPaise), later });
    }
    return out;
  }, [purchases, entries, mirrors]);
}
