// File: frontend/lib/hooks/useProducts.ts
"use client";

import { useEffect, useState } from "react";

import { subscribeProductMaster } from "@/lib/services/productMasterReadService";
import type { ProductMaster } from "@/types/productMaster";

export function useProducts(options?: { includeDeleted?: boolean }) {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeProductMaster(
      (result) => {
        setProducts(result);
        setIsLoading(false);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      },
      options,
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.includeDeleted]);

  return { products, isLoading, error };
}
