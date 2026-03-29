// File: frontend/lib/useDistributors.ts
"use client";

import { useEffect, useState } from "react";

import type { DistributorRow } from "@/app/(dashboard)/admin/_data/mockData";
import {
  approveDistributor,
  createDistributorInFirestore,
  subscribeDistributors,
} from "@/lib/services/distributorService";
import type { CreateDistributorInput } from "@/types/distributor";

export function useDistributors() {
  const [distributors, setDistributors] = useState<DistributorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDistributors(
      (queryRows) => {
        try {
          const distributorsData: DistributorRow[] = queryRows.map((row) => ({
            id: row.uid,
            name: row.name,
            phone: row.phone || "",
            email: row.email || "",
            createdBy: row.createdBy,
            status: row.status === "approved" ? "approved" : "pending",
            contactInfo: row.contactInfo || row.phone || "",
          }));

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
  }, []);

  const handleApproveDistributor = async (distributorId: string) => {
    try {
      await approveDistributor(distributorId);
    } catch (err) {
      console.error("Error approving distributor:", err);
      throw err;
    }
  };

  const createDistributor = async (distributorData: CreateDistributorInput) => {
    try {
      const newDistributor =
        await createDistributorInFirestore(distributorData);

      return {
        id: newDistributor.uid,
        name: newDistributor.name,
        phone: newDistributor.phone || "",
        email: newDistributor.email || "",
        createdBy: newDistributor.createdBy,
        status: "pending",
        contactInfo: newDistributor.contactInfo,
      } as DistributorRow;
    } catch (err) {
      console.error("Error creating distributor:", err);
      throw err;
    }
  };

  return {
    distributors,
    loading,
    error,
    approveDistributor: handleApproveDistributor,
    createDistributor,
  };
}
