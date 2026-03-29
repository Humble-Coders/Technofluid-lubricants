// File: frontend/app/(dashboard)/salesperson/visits/page.tsx
"use client";

import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/useAuth";
import { useVisits } from "@/lib/useVisits";
import { useSalespersonDistributors } from "@/lib/useSalespersonDistributors";
import {
  CreateVisitModal,
  type CreateVisitFormInput,
} from "./_components/CreateVisitModal";
import { VisitsTable } from "./_components/VisitsTable";

export default function SalespersonVisitsPage() {
  const { userData } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const {
    visits,
    createVisit,
    loading: visitsLoading,
    error,
  } = useVisits(userData?.uid ?? null);
  const { distributors, loading: distLoading } = useSalespersonDistributors(
    userData?.uid ?? null,
  );

  const filteredVisits = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (!normalizedSearch) {
      return visits;
    }

    return visits.filter((visit) => {
      return (
        visit.distributorName.toLowerCase().includes(normalizedSearch) ||
        visit.notes.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [visits, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  const paginatedVisits = filteredVisits.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleCreate = async (visitData: CreateVisitFormInput) => {
    try {
      const distributor = distributors.find(
        (d) => d.uid === visitData.distributorId,
      );
      if (!distributor) {
        throw new Error("Distributor not found");
      }

      await createVisit(visitData, distributor.name);
      setIsCreateOpen(false);
    } catch (err) {
      console.error("Failed to create visit:", err);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        Error loading visits: {error}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">
              Total Visits
            </p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {visits.length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">Hot Leads</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {visits.filter((v) => v.leadType === "hot").length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">Warm Leads</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {visits.filter((v) => v.leadType === "warm").length}
            </p>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)} disabled={distLoading}>
          {distLoading ? "Loading..." : "Log Visit"}
        </Button>
      </div>

      <Card>
        <div className="mb-4">
          <Input
            id="visit-search"
            label="Search Visits"
            placeholder="Search by distributor or notes"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <VisitsTable visits={paginatedVisits} loading={visitsLoading} />
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-textSecondary">
            <span>
              Page {page} of {totalPages} ({filteredVisits.length} results)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded px-3 py-1 disabled:opacity-40 hover:bg-surface border border-border"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded px-3 py-1 disabled:opacity-40 hover:bg-surface border border-border"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {isCreateOpen && (
        <CreateVisitModal
          distributors={distributors}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </section>
  );
}
