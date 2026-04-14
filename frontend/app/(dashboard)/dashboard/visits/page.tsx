// File: frontend/app/(dashboard)/dashboard/visits/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";
import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import { useAdminLogVisits } from "@/lib/useAdminLogVisits";
import type { LogVisit } from "@/types/visit";

function toMillis(value: LogVisit["createdAt"]): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toDate().getTime();
  return new Date(value as string | Date).getTime();
}

function formatDate(value: LogVisit["createdAt"]): string {
  if (!value) return "-";

  const date =
    value instanceof Timestamp
      ? value.toDate()
      : new Date(value as string | Date);

  return date.toLocaleString();
}

function statusBadgeClass(status: LogVisit["status"]): string {
  return status === "submitted"
    ? "bg-success/10 text-success border-success/20"
    : "bg-amber-100/70 text-amber-800 border-amber-300/40";
}

export default function DashboardVisitsPage() {
  const { userData, loading } = useAuth();
  const router = useRouter();
  const { visits, loading: visitsLoading, error } = useAdminLogVisits();
  const [search, setSearch] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [selectedVisit, setSelectedVisit] = useState<LogVisit | null>(null);

  const isAdmin = userData?.role === USER_ROLES.ADMIN;

  useEffect(() => {
    if (loading) return;

    if (userData?.role === USER_ROLES.SALESPERSON) {
      router.replace("/salesperson/visits");
      return;
    }

    if (userData?.role && userData.role !== USER_ROLES.ADMIN) {
      router.replace("/dashboard");
    }
  }, [userData, loading, router]);

  const salespersonOptions = useMemo(() => {
    const seen = new Map<string, string>();

    visits.forEach((visit) => {
      if (!visit.salespersonId) return;
      const label = visit.salespersonName || visit.salespersonId;
      if (!seen.has(visit.salespersonId)) {
        seen.set(visit.salespersonId, label);
      }
    });

    return [
      { label: "All Salespersons", value: "all" },
      ...Array.from(seen.entries())
        .map(([value, label]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [visits]);

  const filteredVisits = useMemo(() => {
    const query = search.trim().toLowerCase();

    return visits.filter((visit) => {
      if (
        salespersonFilter !== "all" &&
        visit.salespersonId !== salespersonFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        visit.firmName.toLowerCase().includes(query) ||
        visit.salespersonName.toLowerCase().includes(query) ||
        visit.status.toLowerCase().includes(query)
      );
    });
  }, [visits, search, salespersonFilter]);

  const recentVisits = filteredVisits.slice(0, 30);
  const submittedCount = filteredVisits.filter(
    (visit) => visit.status === "submitted",
  ).length;
  const draftCount = filteredVisits.filter(
    (visit) => visit.status === "draft",
  ).length;

  if (loading || !isAdmin) return null;

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        Error loading visits: {error}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-accent/20 bg-accent/5">
          <p className="text-sm font-medium text-textSecondary">Total Visits</p>
          <p className="mt-1 text-3xl font-bold text-textPrimary">
            {filteredVisits.length}
          </p>
          <p className="mt-1 text-xs text-textSecondary">
            matching current filters
          </p>
        </Card>
        <Card className="border-success/25 bg-success/5">
          <p className="text-sm font-medium text-textSecondary">Submitted</p>
          <p className="mt-1 text-3xl font-bold text-success">
            {submittedCount}
          </p>
          <p className="mt-1 text-xs text-textSecondary">
            finalized visit reports
          </p>
        </Card>
        <Card className="border-amber-300/30 bg-amber-50/70">
          <p className="text-sm font-medium text-textSecondary">Drafts</p>
          <p className="mt-1 text-3xl font-bold text-amber-800">{draftCount}</p>
          <p className="mt-1 text-xs text-textSecondary">
            in-progress visit logs
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-textPrimary">
            Filter Visits
          </h2>
          <p className="mt-1 text-xs text-textSecondary">
            Narrow down by salesperson or search by firm/status.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            id="visits-salesperson-filter"
            label="Filter by Salesperson"
            options={salespersonOptions}
            value={salespersonFilter}
            onChange={(event) => setSalespersonFilter(event.target.value)}
          />
          <Input
            id="visits-search"
            label="Search"
            placeholder="Search by firm, salesperson, or status"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-textPrimary">
            Recent Visits
          </h2>
          <span className="rounded-full border border-border bg-page px-3 py-1 text-xs font-medium text-textSecondary">
            Showing {recentVisits.length} of {filteredVisits.length}
          </span>
        </div>
        {visitsLoading ? (
          <div className="py-8 text-center text-textSecondary">
            Loading visits...
          </div>
        ) : (
          <Table>
            <TableHead>
              <tr>
                <TH>Logged At</TH>
                <TH>Firm</TH>
                <TH>Salesperson</TH>
                <TH>Status</TH>
                <TH>Priorities</TH>
                <TH>Related Firms</TH>
                <TH>Action</TH>
              </tr>
            </TableHead>
            <TableBody>
              {recentVisits.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-textSecondary"
                  >
                    No visits match your filter.
                  </td>
                </tr>
              ) : (
                recentVisits
                  .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
                  .map((visit) => (
                    <tr
                      key={visit.id}
                      className="cursor-pointer transition hover:bg-page/80"
                      onClick={() => setSelectedVisit(visit)}
                    >
                      <TD className="whitespace-nowrap">
                        {formatDate(visit.createdAt)}
                      </TD>
                      <TD className="font-medium">{visit.firmName}</TD>
                      <TD>{visit.salespersonName || visit.salespersonId}</TD>
                      <TD>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                            visit.status,
                          )}`}
                        >
                          {visit.status}
                        </span>
                      </TD>
                      <TD>
                        {visit.priorities.monthly.length} monthly,{" "}
                        {visit.priorities.annually.length} annual
                      </TD>
                      <TD>{visit.relatedFirms.length}</TD>
                      <TD className="text-accent font-semibold">Open</TD>
                    </tr>
                  ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={Boolean(selectedVisit)}
        title={
          selectedVisit ? `Visit: ${selectedVisit.firmName}` : "Visit Details"
        }
        onClose={() => setSelectedVisit(null)}
        mode="workspace"
      >
        {selectedVisit ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  Salesperson
                </p>
                <p className="mt-1 text-sm font-semibold text-textPrimary">
                  {selectedVisit.salespersonName || selectedVisit.salespersonId}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">Status</p>
                <p className="mt-2">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusBadgeClass(
                      selectedVisit.status,
                    )}`}
                  >
                    {selectedVisit.status}
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  Logged At
                </p>
                <p className="mt-1 text-sm font-semibold text-textPrimary">
                  {formatDate(selectedVisit.createdAt)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  Location
                </p>
                <p className="mt-1 text-sm font-semibold text-textPrimary">
                  {selectedVisit.location
                    ? `${selectedVisit.location.lat.toFixed(6)}, ${selectedVisit.location.lng.toFixed(6)}`
                    : "-"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-page p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                    Monthly Priorities
                  </p>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                    {selectedVisit.priorities.monthly.length} items
                  </span>
                </div>
                {selectedVisit.priorities.monthly.length === 0 ? (
                  <p className="text-sm text-textSecondary">
                    No monthly priorities logged.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-sm text-textPrimary">
                    {selectedVisit.priorities.monthly.map((item) => (
                      <li
                        key={`m-${item.productId}-${item.productName}`}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5"
                      >
                        <span>{item.productName}</span>
                        <span className="text-textSecondary">
                          x {item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-border bg-page p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                    Annual Priorities
                  </p>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                    {selectedVisit.priorities.annually.length} items
                  </span>
                </div>
                {selectedVisit.priorities.annually.length === 0 ? (
                  <p className="text-sm text-textSecondary">
                    No annual priorities logged.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-sm text-textPrimary">
                    {selectedVisit.priorities.annually.map((item) => (
                      <li
                        key={`a-${item.productId}-${item.productName}`}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5"
                      >
                        <span>{item.productName}</span>
                        <span className="text-textSecondary">
                          x {item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-page p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                  Related Firms
                </p>
                <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                  {selectedVisit.relatedFirms.length} firms
                </span>
              </div>
              {selectedVisit.relatedFirms.length === 0 ? (
                <p className="text-sm text-textSecondary">
                  No related firms logged.
                </p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedVisit.relatedFirms.map((firm, index) => (
                    <div
                      key={`${firm.name}-${index}`}
                      className="rounded-lg border border-border bg-surface p-3"
                    >
                      <p className="text-sm font-semibold text-textPrimary">
                        {firm.name}
                      </p>
                      <p className="mt-1 text-xs text-textSecondary">
                        {firm.priorities.monthly.length} monthly,{" "}
                        {firm.priorities.annually.length} annual items
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-page p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                  Media
                </p>
                <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                  {selectedVisit.media.length} files
                </span>
              </div>
              {selectedVisit.media.length === 0 ? (
                <p className="text-sm text-textSecondary">No media uploaded.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {selectedVisit.media.map((item, index) => (
                    <a
                      key={`${item.storagePath}-${index}`}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-accent transition hover:bg-surface hover:underline"
                    >
                      {item.type.toUpperCase()} {index + 1}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
