// File: frontend/lib/useDistributors.ts
"use client";

import { useEffect, useState } from "react";

import { sendPasswordResetEmail } from "firebase/auth";

import type { DistributorRow } from "@/app/(dashboard)/admin/_data/mockData";
import { approveDistributorByAdmin, deleteUser } from "@/lib/api/admin";
import { auth } from "@/lib/firebase";
import {
  approveDistributor,
  approveDistributorRequest,
  createDistributorInFirestore,
  deleteDistributorDoc,
  deleteDistributorAllDocs,
  subscribeDistributors,
  updateDistributor,
} from "@/lib/services/distributorService";
import type { CreateDistributorInput, DistributorType, Territory, AssignedProduct } from "@/types/distributor";

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
            address: row.address || "",
            gstNumber: row.gstNumber || "",
            distributorType: row.distributorType,
            territory: row.territory,
            assignedProducts: row.assignedProducts,
            createdBy: row.createdBy,
            status: row.status === "approved" ? "approved" : "pending",
            contactInfo: row.phone || "",
            authCreated: row.authCreated,
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
      const distributor = distributors.find((d) => d.id === distributorId);

      if (distributor && distributor.authCreated === false) {
        // Salesperson-created: no auth user exists yet.
        // Cloud function creates the Auth user, migrates Firestore docs, then we
        // send a password-reset email so the distributor can set their password.
        const { email } = await approveDistributorByAdmin(distributorId);
        await sendPasswordResetEmail(auth, email);
      } else {
        await approveDistributor(distributorId);
      }
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

  const handleUpdateDistributor = async (
    id: string,
    fields: {
      name?: string;
      phone?: string;
      gstNumber?: string;
      address?: string;
      assignedProducts?: AssignedProduct[];
      distributorType?: DistributorType;
      territory?: Territory;
    },
  ) => {
    try {
      await updateDistributor(id, fields);
    } catch (err) {
      console.error("Error updating distributor:", err);
      throw err;
    }
  };

  const handleDeleteDistributor = async (id: string) => {
    try {
      const distributor = distributors.find((d) => d.id === id);
      if (distributor?.authCreated === false) {
        // No auth user — only Firestore doc exists.
        await deleteDistributorDoc(id);
      } else {
        // Cloud Function hard-deletes the Auth user and soft-deletes both Firestore docs.
        await deleteUser({ uid: id });
      }
    } catch (err) {
      console.error("Error deleting distributor:", err);
      throw err;
    }
  };

  return {
    distributors,
    loading,
    error,
    approveDistributor: handleApproveDistributor,
    createDistributor,
    updateDistributor: handleUpdateDistributor,
    deleteDistributor: handleDeleteDistributor,
  };
}
