// File: frontend/lib/useVisits.ts
"use client";

import { useEffect, useState } from "react";

import type { Visit } from "@/types/visit";
import {
  createVisitInFirestore,
  deleteVisitInFirestore,
  subscribeVisitsBySalesperson,
  updateVisitInFirestore,
} from "@/lib/services/visitService";
import type { CreateVisitInput, UpdateVisitInput } from "@/types/visit";

export function useVisits(salespersonId: string | null) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!salespersonId) {
      setVisits([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeVisitsBySalesperson(
      salespersonId,
      (visitsData) => {
        setVisits(visitsData);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to visits:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch visits");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [salespersonId]);

  const createVisit = async (
    input: CreateVisitInput,
    distributorName: string,
  ) => {
    if (!salespersonId) throw new Error("Salesperson ID is required");

    try {
      const newVisit = await createVisitInFirestore(
        input,
        salespersonId,
        distributorName,
      );
      return newVisit;
    } catch (err) {
      console.error("Error creating visit:", err);
      throw err;
    }
  };

  const updateVisit = async (visitId: string, input: UpdateVisitInput) => {
    try {
      await updateVisitInFirestore(visitId, input);
    } catch (err) {
      console.error("Error updating visit:", err);
      throw err;
    }
  };

  const deleteVisit = async (visitId: string) => {
    try {
      await deleteVisitInFirestore(visitId);
    } catch (err) {
      console.error("Error deleting visit:", err);
      throw err;
    }
  };

  return {
    visits,
    loading,
    error,
    createVisit,
    updateVisit,
    deleteVisit,
  };
}
