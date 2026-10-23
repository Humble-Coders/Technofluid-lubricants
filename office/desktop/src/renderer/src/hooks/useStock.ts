import { useEffect, useState } from "react";
import {
  watchMovements,
  watchStockItems,
  type MovementFilter,
  type StockItem,
  type StockMovement,
} from "@/services/stockService";
import type { LoadState } from "./useProducts";

/** Live list of stock items (product pools, raw materials, consumables). */
export function useStockItems(): LoadState<StockItem[]> {
  const [state, setState] = useState<LoadState<StockItem[]>>({ status: "loading" });
  useEffect(
    () =>
      watchStockItems(
        (data) => setState({ status: "ready", data }),
        (err) => setState({ status: "error", message: err.message }),
      ),
    [],
  );
  return state;
}

/** Live diary lines for one item, one business date, or the latest N. Pass null to skip. */
export function useMovements(filter: MovementFilter | null): LoadState<StockMovement[]> {
  const [state, setState] = useState<LoadState<StockMovement[]>>({ status: "loading" });
  const key = filter ? JSON.stringify(filter) : null;
  useEffect(() => {
    if (!key) return;
    setState({ status: "loading" });
    return watchMovements(
      JSON.parse(key) as MovementFilter,
      (data) => setState({ status: "ready", data }),
      (err) => setState({ status: "error", message: err.message }),
    );
  }, [key]);
  return state;
}
