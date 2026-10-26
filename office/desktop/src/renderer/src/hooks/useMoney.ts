import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRegisterBalances,
  getRegisterStatement,
  watchCategories,
  watchMoneyEntries,
  watchMoneyEntry,
  watchMoneyEntryStatuses,
  watchRegisters,
  type CategoryRow,
  type MoneyEntryRow,
  type RegisterRow,
  type RegisterStatement,
  type SyncStatus,
} from "@/services/moneyService";
import type { LoadState } from "./useProducts";

function useWatch<T>(subscribe: (ok: (v: T) => void, err: (e: Error) => void) => () => void, deps: unknown[]): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    return subscribe(
      (data) => setState({ status: "ready", data }),
      (e) => setState({ status: "error", message: e.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useRegisters = () => useWatch<RegisterRow[]>(watchRegisters, []);
export const useCategories = () => useWatch<CategoryRow[]>(watchCategories, []);
/**
 * Entries in a business-day range, each reversed original carrying its mirror's status —
 * a pair only counts as cancelled once the mirror is in the books (core reversalState).
 * Mirrors outside the range (reversed later) are watched by id.
 */
export function useMoneyEntries(from: string, to: string): LoadState<MoneyEntryRow[]> {
  const base = useWatch<MoneyEntryRow[]>((ok, err) => watchMoneyEntries(from, to, ok, err), [from, to]);
  const rows = base.status === "ready" ? base.data : null;
  const missing = useMemo(() => {
    if (!rows) return "";
    const here = new Set(rows.map((e) => e.id));
    return [...new Set(rows.flatMap((e) => (e.reversedByEntryId && !here.has(e.reversedByEntryId) ? [e.reversedByEntryId] : [])))].sort().join(",");
  }, [rows]);
  const [outside, setOutside] = useState<Record<string, SyncStatus>>({});
  useEffect(() => {
    setOutside({});
    if (!missing) return;
    return watchMoneyEntryStatuses(missing.split(","), setOutside);
  }, [missing]);
  return useMemo(() => {
    if (!rows) return base;
    const own = new Map(rows.map((e) => [e.id, e.syncStatus]));
    const data = rows.map((e) => (e.reversedByEntryId ? { ...e, mirrorStatus: own.get(e.reversedByEntryId) ?? outside[e.reversedByEntryId] ?? null } : e));
    return { status: "ready", data };
  }, [base, rows, outside]);
}

/** One entry, live, until it's saved to the books (then the caller refreshes balances). */
export function useMoneyEntry(entryId: string | null) {
  const [row, setRow] = useState<MoneyEntryRow | null>(null);
  useEffect(() => {
    setRow(null);
    if (!entryId) return;
    return watchMoneyEntry(entryId, setRow);
  }, [entryId]);
  return row;
}

/** Register balances from the books; errors kept apart from the list; Retry really retries. */
export function useRegisterBalances() {
  const [balances, setBalances] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBalances(await getRegisterBalances());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { balances, error, loading, retry: load };
}

export function useRegisterStatement(registerId: string, from: string, to: string) {
  const [state, setState] = useState<LoadState<RegisterStatement>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getRegisterStatement(registerId, from, to)
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e) => alive && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [registerId, from, to, nonce]);
  return { state, retry: () => setNonce((x) => x + 1) };
}
