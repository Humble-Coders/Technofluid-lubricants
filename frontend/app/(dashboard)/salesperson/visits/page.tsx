// File: frontend/app/(dashboard)/salesperson/visits/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const PAGE_SIZE = 10;

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/useAuth";
import { useLogVisits } from "@/lib/useLogVisits";
import { deleteVisitInFirestore, deleteVisitMedia } from "@/lib/services/logVisitService";
import { getLogVisitById } from "@/lib/services/logVisitService";
import { VisitsTable } from "./_components/VisitsTable";

export default function SalespersonVisitsPage() {
  const router = useRouter();
  const { userData } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    visits,
    loading: visitsLoading,
    error,
  } = useLogVisits(userData?.uid ?? null);

  const filteredVisits = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (!normalizedSearch) {
      return visits;
    }

    return visits.filter((visit) => {
      return (
        visit.firmName.toLowerCase().includes(normalizedSearch) ||
        visit.status.toLowerCase().includes(normalizedSearch) ||
        String(visit.location?.lat ?? "").includes(normalizedSearch) ||
        String(visit.location?.lng ?? "").includes(normalizedSearch)
      );
    });
  }, [visits, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  const paginatedVisits = filteredVisits.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleDeleteVisit = async (visitId: string) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // Get visit to delete associated media
      const visit = await getLogVisitById(visitId);
      if (visit?.media && visit.media.length > 0) {
        // Delete all media files from Storage
        try {
          await Promise.all(
            visit.media.map((item) => deleteVisitMedia(item.storagePath)),
          );
        } catch (mediaErr) {
          console.warn("Some media files could not be deleted:", mediaErr);
        }
      }

      // Delete visit document from Firestore
      console.log("Deleting visit:", visitId);
      await deleteVisitInFirestore(visitId);
      console.log("Visit deleted successfully");
      setIsDeleting(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete visit";
      console.error("Delete error:", errorMessage, err);
      setDeleteError(errorMessage);
      setIsDeleting(false);
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
            <p className="text-sm font-medium text-textSecondary">Total Logs</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {visits.length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">Submitted</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {visits.filter((v) => v.status === "submitted").length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">Drafts</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {visits.filter((v) => v.status === "draft").length}
            </p>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => router.push("/salesperson/visits/log")}>
          Log Visit
        </Button>
      </div>

      {deleteError && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {deleteError}
        </div>
      )}

      <Card>
        <div className="mb-4">
          <Input
            id="visit-search"
            label="Search Visit Logs"
            placeholder="Search by firm, status, or location"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <VisitsTable
          visits={paginatedVisits}
          loading={visitsLoading || isDeleting}
          onVisitClick={(visitId) => {
            router.push(`/salesperson/visits/log?visitId=${visitId}`);
          }}
          onDeleteClick={handleDeleteVisit}
        />
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
    </section>
  );
}
