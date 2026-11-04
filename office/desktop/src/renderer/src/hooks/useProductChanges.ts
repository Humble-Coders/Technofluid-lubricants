import { useEffect, useState } from "react";
import { watchProductChanges, type ProductChange } from "@/services/productEditService";
import type { LoadState } from "./useProducts";

/** Live change log for one product. Pass null to skip (e.g. roles that can't read it). */
export function useProductChanges(sku: string | null): LoadState<ProductChange[]> {
  const [state, setState] = useState<LoadState<ProductChange[]>>({ status: "loading" });
  useEffect(() => {
    if (!sku) return;
    setState({ status: "loading" });
    return watchProductChanges(
      sku,
      (data) => setState({ status: "ready", data }),
      (err) => setState({ status: "error", message: err.message }),
    );
  }, [sku]);
  return state;
}
