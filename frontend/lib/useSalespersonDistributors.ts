"use client";

import { useEffect, useState } from "react";

import type { Distributor } from "@/types/distributor";
import {
  createDistributorInFirestore,
  subscribeDistributorsBySalesperson,
} from "@/lib/services/distributorService";
import type { CreateDistributorInput } from "@/types/distributor";

export function useSalespersonDistributors(salespersonId: string | null) {
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!salespersonId) {
      setDistributors([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeDistributorsBySalesperson(
      salespersonId,
      (distributorsData) => {
        try {
          setDistributors(distributorsData);
          setError(null);
          setLoading(false);
        } catch (err) {
          console.error("Error processing distributors:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to process distributors",
          );
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to distributors:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch distributors",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [salespersonId]);

  const createDistributor = async (
    distributorData: Omit<CreateDistributorInput, "createdBy">,
  ) => {
    if (!salespersonId) throw new Error("Salesperson ID is required");

    try {
      const newDistributor = await createDistributorInFirestore({
        ...distributorData,
        createdBy: salespersonId,
      });

      return newDistributor;
    } catch (err) {
      console.error("Error creating distributor:", err);
      throw err;
    }
  };

  return {
    distributors,
    loading,
    error,
    createDistributor,
  };
}
