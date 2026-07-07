// File: frontend/lib/hooks/useSeriesPackSizes.ts
"use client";

import { useEffect, useMemo, useState } from "react";

import { productKeysForSeries } from "@/lib/catalogue";
import { getPublicCatalogByKeys } from "@/lib/services/publicCatalogService";

export function useSeriesPackSizes(slug: string) {
  const productKeys = useMemo(() => productKeysForSeries(slug), [slug]);
  const [packSizes, setPackSizes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const docs = await getPublicCatalogByKeys(productKeys);
        if (cancelled) return;
        const union = Array.from(
          new Set(docs.flatMap((doc) => doc.packSizes)),
        );
        setPackSizes(union);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [productKeys]);

  return { packSizes, isLoading, error };
}
