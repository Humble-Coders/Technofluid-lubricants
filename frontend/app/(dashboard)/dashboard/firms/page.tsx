"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";
import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import { getAllFirms, type Firm } from "@/lib/services/firmService";

function formatTimestamp(value: unknown): string {
  if (!value) return "-";
  if (value instanceof Timestamp) return value.toDate().toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

function statusBadgeClass(status?: string): string {
  if (!status) return "bg-border text-textSecondary border-border";
  return status.toLowerCase() === "active"
    ? "bg-success/10 text-success border-success/20"
    : "bg-amber-100/70 text-amber-800 border-amber-300/40";
}

export default function AdminFirmsPage() {
  const { userData, loading } = useAuth();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmsLoading, setFirmsLoading] = useState(true);
  const [firmsError, setFirmsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFirm, setSelectedFirm] = useState<Firm | null>(null);

  const isAdmin = userData?.role === USER_ROLES.ADMIN;

  useEffect(() => {
    if (!isAdmin) return;
    getAllFirms()
      .then(setFirms)
      .catch(() => setFirmsError("Could not load firms. Please refresh."))
      .finally(() => setFirmsLoading(false));
  }, [isAdmin]);

  const filtered = firms.filter((firm) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      firm.gstNumber?.toLowerCase().includes(q) ||
      firm.currentName?.toLowerCase().includes(q) ||
      firm.tradeName?.toLowerCase().includes(q) ||
      firm.legalName?.toLowerCase().includes(q) ||
      firm.state?.toLowerCase().includes(q) ||
      firm.currentAddress?.toLowerCase().includes(q)
    );
  });

  if (loading || !isAdmin) return null;

  if (firmsError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">{firmsError}</div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-accent/20 bg-accent/5">
          <p className="text-sm font-medium text-textSecondary">Total Firms</p>
          <p className="mt-1 text-3xl font-bold text-textPrimary">
            {filtered.length}
          </p>
          <p className="mt-1 text-xs text-textSecondary">in database</p>
        </Card>
        <Card className="border-success/25 bg-success/5">
          <p className="text-sm font-medium text-textSecondary">Active GST</p>
          <p className="mt-1 text-3xl font-bold text-success">
            {
              filtered.filter(
                (f) => f.gstStatus?.toLowerCase() === "active",
              ).length
            }
          </p>
          <p className="mt-1 text-xs text-textSecondary">verified active</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-textSecondary">
            GST Verified
          </p>
          <p className="mt-1 text-3xl font-bold text-textPrimary">
            {filtered.filter((f) => f.gstVerifiedAt).length}
          </p>
          <p className="mt-1 text-xs text-textSecondary">via GST API</p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-textPrimary">
            Search Firms
          </h2>
          <p className="mt-1 text-xs text-textSecondary">
            Search by GST number, name, state, or address.
          </p>
        </div>
        <Input
          id="firms-search"
          label="Search"
          placeholder="Search by GST number, firm name, state, or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-textPrimary">All Firms</h2>
          <span className="rounded-full border border-border bg-page px-3 py-1 text-xs font-medium text-textSecondary">
            {filtered.length} firm{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        {firmsLoading ? (
          <div className="py-8 text-center text-textSecondary">
            Loading firms...
          </div>
        ) : (
          <Table>
            <TableHead>
              <tr>
                <TH>GST Number</TH>
                <TH>Firm Name</TH>
                <TH>State</TH>
                <TH>GST Status</TH>
                <TH>Address</TH>
                <TH>Locations</TH>
                <TH>Last Updated</TH>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-textSecondary"
                  >
                    No firms match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((firm) => (
                  <tr
                    key={firm.gstNumber}
                    className="cursor-pointer transition hover:bg-page/80"
                    onClick={() => setSelectedFirm(firm)}
                  >
                    <TD className="font-mono text-xs">{firm.gstNumber}</TD>
                    <TD className="font-medium">
                      {firm.tradeName || firm.currentName || "-"}
                    </TD>
                    <TD>{firm.state || "-"}</TD>
                    <TD>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(firm.gstStatus)}`}
                      >
                        {firm.gstStatus || "Unknown"}
                      </span>
                    </TD>
                    <TD className="max-w-[200px] truncate text-sm text-textSecondary">
                      {firm.currentAddress || "-"}
                    </TD>
                    <TD>{firm.history?.length ?? 0}</TD>
                    <TD className="whitespace-nowrap text-sm text-textSecondary">
                      {formatTimestamp(firm.updatedAt)}
                    </TD>
                  </tr>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={Boolean(selectedFirm)}
        title={
          selectedFirm
            ? (selectedFirm.tradeName || selectedFirm.currentName || selectedFirm.gstNumber)
            : "Firm Details"
        }
        onClose={() => setSelectedFirm(null)}
        mode="workspace"
      >
        {selectedFirm ? (
          <div className="space-y-5">
            {/* Core identity */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  GST Number
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-textPrimary">
                  {selectedFirm.gstNumber}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  GST Status
                </p>
                <p className="mt-2">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusBadgeClass(selectedFirm.gstStatus)}`}
                  >
                    {selectedFirm.gstStatus || "Unknown"}
                  </span>
                </p>
              </div>
              {selectedFirm.legalName && (
                <div className="rounded-xl border border-border bg-page p-4">
                  <p className="text-xs font-medium text-textSecondary">
                    Legal Name
                  </p>
                  <p className="mt-1 text-sm font-semibold text-textPrimary">
                    {selectedFirm.legalName}
                  </p>
                </div>
              )}
              {selectedFirm.tradeName && (
                <div className="rounded-xl border border-border bg-page p-4">
                  <p className="text-xs font-medium text-textSecondary">
                    Trade Name
                  </p>
                  <p className="mt-1 text-sm font-semibold text-textPrimary">
                    {selectedFirm.tradeName}
                  </p>
                </div>
              )}
              {selectedFirm.constitution && (
                <div className="rounded-xl border border-border bg-page p-4">
                  <p className="text-xs font-medium text-textSecondary">
                    Constitution
                  </p>
                  <p className="mt-1 text-sm font-semibold text-textPrimary">
                    {selectedFirm.constitution}
                  </p>
                </div>
              )}
              {selectedFirm.registrationDate && (
                <div className="rounded-xl border border-border bg-page p-4">
                  <p className="text-xs font-medium text-textSecondary">
                    Registration Date
                  </p>
                  <p className="mt-1 text-sm font-semibold text-textPrimary">
                    {selectedFirm.registrationDate}
                  </p>
                </div>
              )}
              {selectedFirm.state && (
                <div className="rounded-xl border border-border bg-page p-4">
                  <p className="text-xs font-medium text-textSecondary">
                    State
                  </p>
                  <p className="mt-1 text-sm font-semibold text-textPrimary">
                    {selectedFirm.state}
                  </p>
                </div>
              )}
              {selectedFirm.pincode && (
                <div className="rounded-xl border border-border bg-page p-4">
                  <p className="text-xs font-medium text-textSecondary">
                    Pincode
                  </p>
                  <p className="mt-1 text-sm font-semibold text-textPrimary">
                    {selectedFirm.pincode}
                  </p>
                </div>
              )}
            </div>

            {/* Registered address */}
            {selectedFirm.registeredAddress && (
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  Registered Address
                </p>
                <p className="mt-1 text-sm text-textPrimary">
                  {selectedFirm.registeredAddress}
                </p>
              </div>
            )}

            {/* Current visit address */}
            {selectedFirm.currentAddress && (
              <div className="rounded-xl border border-border bg-page p-4">
                <p className="text-xs font-medium text-textSecondary">
                  Latest Visit Address
                </p>
                <p className="mt-1 text-sm text-textPrimary">
                  {selectedFirm.currentAddress}
                </p>
                {selectedFirm.currentLocation && (
                  <p className="mt-0.5 font-mono text-xs text-textSecondary">
                    {selectedFirm.currentLocation.lat.toFixed(6)},{" "}
                    {selectedFirm.currentLocation.lng.toFixed(6)}
                  </p>
                )}
              </div>
            )}

            {/* Default priorities */}
            {(selectedFirm.defaultPriorities?.monthly?.length > 0 ||
              selectedFirm.defaultPriorities?.annually?.length > 0) && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-page p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                      Default Monthly Priorities
                    </p>
                    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                      {selectedFirm.defaultPriorities.monthly.length} items
                    </span>
                  </div>
                  {selectedFirm.defaultPriorities.monthly.length === 0 ? (
                    <p className="text-sm text-textSecondary">None.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedFirm.defaultPriorities.monthly.map((item) => (
                        <li
                          key={`dm-${item.productId}`}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm text-textPrimary"
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
                      Default Annual Priorities
                    </p>
                    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                      {selectedFirm.defaultPriorities.annually.length} items
                    </span>
                  </div>
                  {selectedFirm.defaultPriorities.annually.length === 0 ? (
                    <p className="text-sm text-textSecondary">None.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedFirm.defaultPriorities.annually.map((item) => (
                        <li
                          key={`da-${item.productId}`}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm text-textPrimary"
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
            )}

            {/* Location history */}
            {selectedFirm.history?.length > 0 && (
              <div className="rounded-xl border border-border bg-page p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                    Location History
                  </p>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-textSecondary">
                    {selectedFirm.history.length} location
                    {selectedFirm.history.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-3">
                  {selectedFirm.history.map((entry, i) => (
                    <div
                      key={`${entry.address}-${i}`}
                      className="rounded-lg border border-border bg-surface p-3 space-y-1"
                    >
                      <p className="text-sm font-semibold text-textPrimary">
                        {entry.firmName}
                      </p>
                      <p className="text-xs text-textSecondary">
                        {entry.address}
                      </p>
                      {entry.location && (
                        <p className="font-mono text-xs text-textSecondary">
                          {entry.location.lat.toFixed(6)},{" "}
                          {entry.location.lng.toFixed(6)}
                        </p>
                      )}
                      <p className="text-xs text-textSecondary">
                        {entry.priorities?.monthly?.length ?? 0} monthly,{" "}
                        {entry.priorities?.annually?.length ?? 0} annual
                        priorities
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
