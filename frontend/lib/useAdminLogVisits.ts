"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";

import { subscribeAllLogVisits } from "@/lib/services/logVisitService";
import type { LogVisit } from "@/types/visit";

function toMillis(value: LogVisit["createdAt"]): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toDate().getTime();
  return new Date(value as string | Date).getTime();
}

export function useAdminLogVisits() {
  const [visits, setVisits] = useState<LogVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeAllLogVisits(
      (rows) => {
        const normalized = rows
          .filter((row) => row.firmName.trim().length > 0)
          .sort(
            (left, right) =>
              toMillis(right.createdAt) - toMillis(left.createdAt),
          );

        setVisits(normalized);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { visits, loading, error };
}
