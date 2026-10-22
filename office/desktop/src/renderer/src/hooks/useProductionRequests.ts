import { useEffect, useState } from "react";
import { watchProductionRequests, type ProductionFilter, type ProductionRequest } from "@/services/productionService";
import type { LoadState } from "./useProducts";

/** Live production entries waiting for (or decided by) an Admin. Pass null to skip. */
export function useProductionRequests(filter: ProductionFilter | null): LoadState<ProductionRequest[]> {
  const [state, setState] = useState<LoadState<ProductionRequest[]>>({ status: "loading" });
  const key = filter ? JSON.stringify(filter) : null;
  useEffect(() => {
    if (!key) return;
    setState({ status: "loading" });
    return watchProductionRequests(
      JSON.parse(key) as ProductionFilter,
      (data) => setState({ status: "ready", data }),
      (err) => setState({ status: "error", message: err.message }),
    );
  }, [key]);
  return state;
}
