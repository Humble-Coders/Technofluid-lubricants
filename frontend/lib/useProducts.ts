// File: frontend/lib/useProducts.ts
"use client";

import { useEffect, useState } from "react";

import type { Product } from "@/types/product";
import { subscribeActiveProducts } from "@/lib/services/productService";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeActiveProducts(
      (data) => {
        setProducts(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to products:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch products");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { products, loading, error };
}
