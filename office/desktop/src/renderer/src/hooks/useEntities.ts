import { useCallback, useEffect, useState } from "react";
import { watchEntities, watchEntityHistory, type EntityHistoryRow, type EntityRow } from "@/services/entityService";
import { getEntityBalances, getEntityStatement, type EntityBalance, type Statement } from "@/services/ledgerService";
import type { LoadState } from "./useProducts";
import { useLoadingSignal } from "@/lib/screenLoading";

/** Live list of customers & suppliers (profiles only — no money). */
export function useEntities(): LoadState<EntityRow[]> {
  const [state, setState] = useState<LoadState<EntityRow[]>>({ status: "loading" });
  useEffect(
    () =>
      watchEntities(
        (data) => setState({ status: "ready", data }),
        (err) => setState({ status: "error", message: err.message }),
      ),
    [],
  );
  useLoadingSignal(state.status === "loading");
  return state;
}

export function useEntityHistory(entityId: string | null): LoadState<EntityHistoryRow[]> {
  const [state, setState] = useState<LoadState<EntityHistoryRow[]>>({ status: "loading" });
  useEffect(() => {
    if (!entityId) return;
    setState({ status: "loading" });
    return watchEntityHistory(
      entityId,
      (data) => setState({ status: "ready", data }),
      (err) => setState({ status: "error", message: err.message }),
    );
  }, [entityId]);
  useLoadingSignal(state.status === "loading" && Boolean(entityId));
  return state;
}

/**
 * Balances from the books. Errors are kept apart from the list (Aromex lesson 4): the
 * list still shows, balances show "—", and `retry` really fetches again.
 */
export function useEntityBalances(refreshKey: unknown) {
  const [balances, setBalances] = useState<Record<string, EntityBalance> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBalances(await getEntityBalances());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useLoadingSignal(loading);
  return { balances, error, loading, retry: load };
}

export function useEntityStatement(entityId: string | null, from: string, to: string, enabled: boolean) {
  const [state, setState] = useState<LoadState<Statement>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!entityId || !enabled) return;
    let alive = true;
    setState({ status: "loading" });
    getEntityStatement(entityId, from, to)
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e) => alive && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [entityId, from, to, enabled, nonce]);
  useLoadingSignal(state.status === "loading" && Boolean(entityId) && enabled);
  return { state, retry: () => setNonce((n) => n + 1) };
}
