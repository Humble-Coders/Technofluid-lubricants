import { useEffect, useState } from "react";
import { watchProducts, type Product } from "@/services/productService";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * Live product list. One listener per mounted screen; detached when the screen closes.
 * Prices are only fetched for roles allowed to see them.
 */
export function useProducts({ withPrices }: { withPrices: boolean }): LoadState<Product[]> {
  const [state, setState] = useState<LoadState<Product[]>>({ status: "loading" });
  useEffect(
    () =>
      watchProducts(
        { withPrices },
        (data) => setState({ status: "ready", data }),
        (err) => setState({ status: "error", message: err.message }),
      ),
    [withPrices],
  );
  return state;
}
