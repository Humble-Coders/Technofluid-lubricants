"use client";

import { useEffect, useState } from "react";

import type { SalespersonRow } from "@/app/(dashboard)/admin/_data/mockData";
import { USER_ROLES } from "@/lib/constants";
import {
  approveUser,
  createUserInFirestore,
  subscribeUsersByRole,
} from "@/lib/services/userService";

type CreateSalespersonInput = {
  name: string;
  phone: string;
  email: string;
  createdBy?: string;
};

function toDate(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate: () => Date };
    return timestamp.toDate().toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export function useSalespersons() {
  const [salespersons, setSalespersons] = useState<SalespersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeUsersByRole(
      USER_ROLES.SALESPERSON,
      (queryRows) => {
        try {
          const salespersonsData: SalespersonRow[] = queryRows.map((row) => ({
            id: row.uid,
            name: row.name,
            phone: row.phone || "",
            email: row.email,
            status: row.status === "approved" ? "approved" : "pending",
            createdAt: toDate(row.createdAt),
          }));

          setSalespersons(salespersonsData);
          setError(null);
          setLoading(false);
        } catch (err) {
          console.error("Error processing salespersons:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to process salespersons",
          );
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to salespersons:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch salespersons",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const approveSalesperson = async (salespersonId: string) => {
    try {
      await approveUser(salespersonId);
    } catch (err) {
      console.error("Error approving salesperson:", err);
      throw err;
    }
  };

  const createSalesperson = async (salespersonData: CreateSalespersonInput) => {
    try {
      const newSalesperson = await createUserInFirestore({
        email: salespersonData.email,
        name: salespersonData.name,
        phone: salespersonData.phone,
        role: USER_ROLES.SALESPERSON,
        createdBy: salespersonData.createdBy,
      });

      return {
        id: newSalesperson.uid,
        name: newSalesperson.name,
        phone: newSalesperson.phone || "",
        email: newSalesperson.email,
        status: "pending",
        createdAt: new Date().toISOString().slice(0, 10),
      } as SalespersonRow;
    } catch (err) {
      console.error("Error creating salesperson:", err);
      throw err;
    }
  };

  return {
    salespersons,
    loading,
    error,
    approveSalesperson,
    createSalesperson,
  };
}
