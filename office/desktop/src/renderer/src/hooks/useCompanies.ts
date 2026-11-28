import { useCallback, useEffect, useState } from "react";
import { refreshCompanies, watchCompanies, type CompanyRow } from "@/services/companyService";
import type { LoadState } from "./useProducts";

/**
 * The companies (admin), live from Firestore. On first use it also asks the server to
 * re-read Humble Ledger's company list once, so a company made in the HL dashboard (or
 * the main company itself) shows up. `refreshError` says why that didn't work.
 */
export function useCompanies(): LoadState<CompanyRow[]> & { refreshError: string | null; refreshing: boolean; refresh: () => Promise<void> } {
  const [state, setState] = useState<LoadState<CompanyRow[]>>({ status: "loading" });
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(
    () =>
      watchCompanies(
        (data) => setState({ status: "ready", data }),
        (e) => setState({ status: "error", message: e.message }),
      ),
    [],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCompanies();
      setRefreshError(null);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refreshError, refreshing, refresh };
}
