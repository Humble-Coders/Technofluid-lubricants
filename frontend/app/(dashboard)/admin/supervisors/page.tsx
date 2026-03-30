// File: frontend/app/(dashboard)/admin/supervisors/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useSupervisors } from "@/lib/useSupervisors";
import { createSupervisor as createSupervisorAction } from "@/lib/actions/createSupervisor";
import type { SupervisorRow } from "../_data/mockData";
import {
  CreateSupervisorModal,
  type CreateSupervisorFormInput,
} from "./_components/CreateSupervisorModal";
import { EditSupervisorModal } from "./_components/EditSupervisorModal";
import { SupervisorsStats } from "./_components/SupervisorsStats";
import { SupervisorsTable } from "./_components/SupervisorsTable";

export default function SupervisorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupervisorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupervisorRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { supervisors, approveSupervisor, updateSupervisor, deleteSupervisor } =
    useSupervisors();

  const filteredSupervisors = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let rows = supervisors;
    if (normalizedSearch) {
      rows = rows.filter((supervisor) => {
        return (
          supervisor.name.toLowerCase().includes(normalizedSearch) ||
          supervisor.email.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((supervisor) => supervisor.status === statusFilter);
    }

    return rows;
  }, [searchQuery, statusFilter, supervisors]);

  const handleApprove = async (id: string) => {
    try {
      await approveSupervisor(id);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to approve supervisor";
      setErrorMessage(message);
    }
  };

  const handleCreate = async (supervisorData: CreateSupervisorFormInput) => {
    try {
      await createSupervisorAction(supervisorData);
      setIsCreateOpen(false);
    } catch (err) {
      console.error("Failed to create supervisor:", err);
    }
  };

  const handleEdit = async (
    id: string,
    fields: { name?: string; phone?: string },
  ) => {
    try {
      await updateSupervisor(id, fields);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update supervisor";
      setErrorMessage(message);
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteSupervisor(deleteTarget.id);
  };

  return (
    <section className="space-y-5">
      {errorMessage && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
          {errorMessage}
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto block text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <SupervisorsStats supervisors={supervisors} />

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>Create Supervisor</Button>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="supervisor-search"
            label="Search"
            placeholder="Search name or email"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Select
            id="supervisor-status"
            label="Filter by Status"
            options={[
              { label: "All", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
            ]}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "pending" | "approved",
              )
            }
          />
        </div>
      </Card>

      <SupervisorsTable
        supervisors={filteredSupervisors}
        onApprove={handleApprove}
        onEdit={(s) => setEditTarget(s)}
        onDelete={(s) => setDeleteTarget(s)}
      />

      <CreateSupervisorModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />

      {editTarget && (
        <EditSupervisorModal
          open={!!editTarget}
          initial={{ id: editTarget.id, name: editTarget.name, phone: editTarget.phone ?? "" }}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      <DeleteConfirmModal
        open={!!deleteTarget}
        name={deleteTarget?.name ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </section>
  );
}
