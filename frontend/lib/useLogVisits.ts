"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";

import { subscribeLogVisitsBySalesperson } from "@/lib/services/logVisitService";
import type { LogVisit } from "@/types/visit";

function toMillis(value: LogVisit["createdAt"]): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toDate().getTime();
  return new Date(value as string | Date).getTime();
}

export function useLogVisits(salespersonId: string | null) {
  const [visits, setVisits] = useState<LogVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!salespersonId) {
      setVisits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeLogVisitsBySalesperson(
      salespersonId,
      (rows) => {
        setVisits(
          [...rows].sort((left, right) => {
            return toMillis(right.createdAt) - toMillis(left.createdAt);
          }),
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [salespersonId]);

  return { visits, loading, error };
}
