// File: frontend/app/(dashboard)/admin/salespersons/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useSalespersons } from "@/lib/useSalespersons";
import { createSalesperson as createSalespersonAction } from "@/lib/actions/createSalesperson";
import type { SalespersonRow } from "../_data/mockData";
import {
  CreateSalespersonModal,
  type CreateSalespersonFormInput,
} from "./_components/CreateSalespersonModal";
import { EditSalespersonModal } from "./_components/EditSalespersonModal";
import { SalespersonsStats } from "./_components/SalespersonsStats";
import { SalespersonsTable } from "./_components/SalespersonsTable";

export default function SalespersonsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SalespersonRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalespersonRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { salespersons, approveSalesperson, updateSalesperson, deleteSalesperson } =
    useSalespersons();

  const filteredSalespersons = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let rows = salespersons;
    if (normalizedSearch) {
      rows = rows.filter((salesperson) => {
        return (
          salesperson.name.toLowerCase().includes(normalizedSearch) ||
          salesperson.email.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((salesperson) => salesperson.status === statusFilter);
    }

    return rows;
  }, [searchQuery, statusFilter, salespersons]);

  const handleApprove = async (id: string) => {
    try {
      await approveSalesperson(id);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to approve salesperson";
      setErrorMessage(message);
    }
  };

  const handleCreate = async (salespersonData: CreateSalespersonFormInput) => {
    try {
      await createSalespersonAction(salespersonData);
      setErrorMessage(null);
      setIsCreateOpen(false);
    } catch (err) {
      console.error("Failed to create salesperson");
    }
  };

  const handleEdit = async (
    id: string,
    fields: { name?: string; phone?: string },
  ) => {
    try {
      await updateSalesperson(id, fields);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update salesperson";
      setErrorMessage(message);
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteSalesperson(deleteTarget.id);
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

      <SalespersonsStats salespersons={salespersons} />

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>
          Create Salesperson
        </Button>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="salesperson-search"
            label="Search"
            placeholder="Search name or email"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Select
            id="salesperson-status"
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

      <SalespersonsTable
        salespersons={filteredSalespersons}
        onApprove={handleApprove}
        onEdit={(s) => setEditTarget(s)}
        onDelete={(s) => setDeleteTarget(s)}
      />

      <CreateSalespersonModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />

      {editTarget && (
        <EditSalespersonModal
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
