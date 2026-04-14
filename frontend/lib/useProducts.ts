// File: frontend/lib/useProducts.ts
"use client";

import { useEffect, useState } from "react";

import type { Product } from "@/types/product";
import { MOCK_PRODUCTS } from "@/lib/mockProducts";
import { subscribeActiveProducts } from "@/lib/services/productService";

const USE_MOCK_PRODUCTS = true;

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeActiveProducts(
      (data) => {
        setProducts(
          data.length > 0 || !USE_MOCK_PRODUCTS ? data : MOCK_PRODUCTS,
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to products:", err);
        setProducts(USE_MOCK_PRODUCTS ? MOCK_PRODUCTS : []);
        setError(
          err instanceof Error ? err.message : "Failed to fetch products",
        );
        setLoading(false);
      },
    );

    if (USE_MOCK_PRODUCTS) {
      setProducts(MOCK_PRODUCTS);
    }

    return () => unsubscribe();
  }, []);

  return { products, loading, error };
}
