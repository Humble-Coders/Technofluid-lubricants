// File: frontend/app/(dashboard)/admin/salespersons/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useSalespersons } from "@/lib/useSalespersons";
import { createSalesperson as createSalespersonAction } from "@/lib/actions/createSalesperson";
import {
  CreateSalespersonModal,
  type CreateSalespersonFormInput,
} from "./_components/CreateSalespersonModal";
import { SalespersonsStats } from "./_components/SalespersonsStats";
import { SalespersonsTable } from "./_components/SalespersonsTable";

export default function SalespersonsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // ✅ NEW
  const { salespersons, approveSalesperson } = useSalespersons();

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
      setErrorMessage(null); // ✅ Clear error on success
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to approve salesperson";
      setErrorMessage(message); // ✅ Show error
      console.error("Failed to approve salesperson:", err);
    }
  };

  const handleCreate = async (salespersonData: CreateSalespersonFormInput) => {
    try {
      await createSalespersonAction(salespersonData);
      setErrorMessage(null); // ✅ Clear error on success
      setIsCreateOpen(false);
      // Note: useSalespersons() will auto-refresh via Firestore subscription
    } catch (err) {
      // ✅ Don't log password in console for security!
      console.error("Failed to create salesperson");
    }
  };

  return (
    <section className="space-y-5">
      {/* ✅ NEW: Error alert at top */}
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
      />

      <CreateSalespersonModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />
    </section>
  );
}