// File: frontend/lib/useSupervisors.ts
"use client";

import { useEffect, useState } from "react";

import type { SupervisorRow } from "@/app/(dashboard)/admin/_data/mockData";
import { USER_ROLES } from "@/lib/constants";
import { deleteUser } from "@/lib/api/admin";
import {
  approveUser,
  createUserInFirestore,
  subscribeUsersByRole,
  updateUser,
} from "@/lib/services/userService";

type CreateSupervisorInput = {
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

export function useSupervisors() {
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeUsersByRole(
      USER_ROLES.SUPERVISOR,
      (queryRows) => {
        try {
          const supervisorsData: SupervisorRow[] = queryRows.map((row) => ({
            id: row.uid,
            name: row.name,
            phone: row.phone || "",
            email: row.email,
            status: row.status === "approved" ? "approved" : "pending",
            createdAt: toDate(row.createdAt),
          }));

          setSupervisors(supervisorsData);
          setError(null);
          setLoading(false);
        } catch (err) {
          console.error("Error processing supervisors:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to process supervisors",
          );
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to supervisors:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch supervisors",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const approveSupervisor = async (supervisorId: string) => {
    try {
      await approveUser(supervisorId);
    } catch (err) {
      console.error("Error approving supervisor:", err);
      throw err;
    }
  };

  const createSupervisor = async (supervisorData: CreateSupervisorInput) => {
    try {
      const newSupervisor = await createUserInFirestore({
        email: supervisorData.email,
        name: supervisorData.name,
        phone: supervisorData.phone,
        role: USER_ROLES.SUPERVISOR,
        createdBy: supervisorData.createdBy,
      });

      return {
        id: newSupervisor.uid,
        name: newSupervisor.name,
        phone: newSupervisor.phone || "",
        email: newSupervisor.email,
        status: "pending",
        createdAt: new Date().toISOString().slice(0, 10),
      } as SupervisorRow;
    } catch (err) {
      console.error("Error creating supervisor:", err);
      throw err;
    }
  };

  const updateSupervisor = async (
    id: string,
    fields: { name?: string; phone?: string },
  ) => {
    try {
      await updateUser(id, fields);
    } catch (err) {
      console.error("Error updating supervisor:", err);
      throw err;
    }
  };

  const deleteSupervisor = async (id: string) => {
    try {
      await deleteUser({ uid: id });
    } catch (err) {
      console.error("Error deleting supervisor:", err);
      throw err;
    }
  };

  return {
    supervisors,
    loading,
    error,
    approveSupervisor,
    createSupervisor,
    updateSupervisor,
    deleteSupervisor,
  };
}
