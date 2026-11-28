import { useEffect, useMemo, useState } from "react";
import { dataGaps, type DataGap, type GapDecision } from "@technofluid/core";
import { watchGapDecisions } from "@/services/dataGapService";
import type { Product } from "@/services/productService";
import type { StockItem } from "@/services/stockService";
import { useProducts, type LoadState } from "./useProducts";
import { useStockItems } from "./useStock";

export interface DataGapsView {
  gaps: DataGap[];
  products: Product[];
  items: StockItem[];
  /**
   * False when the decisions (not needed / answers / keep-remove) can't be read, e.g. the
   * server hasn't been updated with them yet. Values can still be filled in meanwhile.
   */
  decisionsAvailable: boolean;
}

/**
 * Everything still to fill in (Admin): worked out live from products, stock items and the
 * recorded decisions, so a gap disappears as soon as its value is saved.
 */
export function useDataGaps(): LoadState<DataGapsView> {
  const products = useProducts({ withPrices: true });
  const items = useStockItems();
  const [decisions, setDecisions] = useState<LoadState<GapDecision[]>>({ status: "loading" });
  useEffect(
    () =>
      watchGapDecisions(
        (data) => setDecisions({ status: "ready", data }),
        (err) => setDecisions({ status: "error", message: err.message }),
      ),
    [],
  );

  return useMemo((): LoadState<DataGapsView> => {
    if (products.status === "error") return products;
    if (items.status === "error") return items;
    if (products.status !== "ready" || items.status !== "ready" || decisions.status === "loading") return { status: "loading" };
    const decided = decisions.status === "ready" ? decisions.data : [];
    const gaps = dataGaps({ products: products.data, items: items.data, decisions: decided });
    return { status: "ready", data: { gaps, products: products.data, items: items.data, decisionsAvailable: decisions.status === "ready" } };
  }, [products, items, decisions]);
}
