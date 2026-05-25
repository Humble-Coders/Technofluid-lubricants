// File: frontend/app/(dashboard)/admin/distributors/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useDistributors } from "@/lib/useDistributors";
import { useSalespersons } from "@/lib/useSalespersons";
import type { DistributorRow } from "../_data/mockData";
import { DistributorsStats } from "./_components/DistributorsStats";
import { DistributorsTable } from "./_components/DistributorsTable";
import type { DistributorType } from "@/types/distributor";
import { EditDistributorModal, type EditDistributorFields } from "./_components/EditDistributorModal";

export default function DistributorsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [editTarget, setEditTarget] = useState<DistributorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DistributorRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { distributors, approveDistributor, updateDistributor, deleteDistributor } =
    useDistributors();
  const { salespersons } = useSalespersons();
  const salespersonNameById = useMemo(
    () => Object.fromEntries(salespersons.map((s) => [s.id, s.name])),
    [salespersons],
  );

  const filteredDistributors = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let rows = distributors;
    if (normalizedSearch) {
      rows = rows.filter((distributor) => {
        return (
          distributor.name.toLowerCase().includes(normalizedSearch) ||
          distributor.createdBy.toLowerCase().includes(normalizedSearch) ||
          distributor.contactInfo.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((distributor) => distributor.status === statusFilter);
    }

    return rows;
  }, [distributors, searchQuery, statusFilter]);

  const handleApprove = async (distributorId: string) => {
    try {
      await approveDistributor(distributorId);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to approve distributor";
      setErrorMessage(message);
    }
  };

  const handleEdit = async (id: string, fields: EditDistributorFields) => {
    try {
      await updateDistributor(id, fields);
      setErrorMessage(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update distributor";
      setErrorMessage(message);
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDistributor(deleteTarget.id);
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

      <DistributorsStats distributors={distributors} />

      <div className="flex justify-end">
        <Button onClick={() => router.push("/admin/distributors/create")}>
          Create Distributor
        </Button>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="distributor-search"
            label="Search"
            placeholder="Search name, creator, or contact"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Select
            id="distributor-status"
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

      <DistributorsTable
        distributors={filteredDistributors}
        salespersonNameById={salespersonNameById}
        onApprove={handleApprove}
        onEdit={(d) => setEditTarget(d)}
        onDelete={(d) => setDeleteTarget(d)}
      />

      {editTarget && (
        <EditDistributorModal
          open={!!editTarget}
          initial={{
            id: editTarget.id,
            name: editTarget.name,
            phone: editTarget.phone ?? "",
            gstNumber: editTarget.gstNumber ?? "",
            address: editTarget.address ?? "",
            distributorType: editTarget.distributorType as DistributorType | undefined,
            assignedProducts: editTarget.assignedProducts ?? [],
          }}
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
