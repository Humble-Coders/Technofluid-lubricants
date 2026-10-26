import { useCallback, useEffect, useState } from "react";
import {
  getRegisterBalances,
  getRegisterStatement,
  watchCategories,
  watchMoneyEntries,
  watchMoneyEntry,
  watchRegisters,
  type CategoryRow,
  type MoneyEntryRow,
  type RegisterRow,
  type RegisterStatement,
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
export const useMoneyEntries = (from: string, to: string) => useWatch<MoneyEntryRow[]>((ok, err) => watchMoneyEntries(from, to, ok, err), [from, to]);

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
