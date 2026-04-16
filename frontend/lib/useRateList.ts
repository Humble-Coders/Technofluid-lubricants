// File: frontend/lib/useRateList.ts
"use client";

import { useEffect, useState } from "react";

import type { RateListEntry } from "@/types/product";
import { subscribeGlobalRateList } from "@/lib/services/rateListService";

export function useRateList() {
  const [entries, setEntries] = useState<RateListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeGlobalRateList(
      (data) => {
        setEntries(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to rate list:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch rate list",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { entries, loading, error };
}
