// File: frontend/app/(dashboard)/salesperson/page.tsx
"use client";

import { Timestamp } from "firebase/firestore";

import { useAuth } from "@/lib/useAuth";
import { useSalespersonDistributors } from "@/lib/useSalespersonDistributors";
import { useSalespersonOrders } from "@/lib/useSalespersonOrders";
import { useLogVisits } from "@/lib/useLogVisits";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LogVisit } from "@/types/visit";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function toMillis(value: LogVisit["createdAt"]): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toDate().getTime();
  return new Date(value as string | Date).getTime();
}

function formatDate(value: LogVisit["createdAt"]): string {
  if (!value) return "Date not available";
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : new Date(value as string | Date);

  if (Number.isNaN(date.getTime())) return "Date not available";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatLocation(location: LogVisit["location"]): string {
  if (!location) return "Location not captured";
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
}

export default function SalespersonDashboardPage() {
  const { userData } = useAuth();
  const { distributors, loading: distLoading } = useSalespersonDistributors(
    userData?.uid ?? null,
  );
  const { orders, loading: ordLoading } = useSalespersonOrders(
    userData?.uid ?? null,
  );
  const { visits, loading: visitsLoading } = useLogVisits(
    userData?.uid ?? null,
  );

  const isLoading = distLoading || ordLoading || visitsLoading;

  const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  const stats = [
    {
      id: "distributors",
      label: "My Distributors",
      value: isLoading ? "—" : distributors.length.toString(),
      accent: "bg-accent/10 text-accent",
    },
    {
      id: "orders",
      label: "Total Orders",
      value: isLoading ? "—" : orders.length.toString(),
      accent: "bg-info/10 text-info",
    },
    {
      id: "pending",
      label: "Pending Orders",
      value: isLoading ? "—" : pendingOrders.toString(),
      accent: "bg-warning/10 text-warning",
    },
    {
      id: "value",
      label: "Total Order Value",
      value: isLoading ? "—" : `₹${totalValue.toLocaleString()}`,
      accent: "bg-success/10 text-success",
    },
  ];

  const recentOrders = [...orders]
    .sort((a, b) => ((b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1))
    .slice(0, 3);

  const recentVisits = [...visits]
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, 3);

  return (
    <section className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-textPrimary">
          {getGreeting()}, {userData?.name ?? ""}
        </h2>
        <p className="mt-1 text-sm text-textSecondary">
          Here&rsquo;s a summary of your activity.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.id} className="p-5">
            <div
              className={`mb-3 inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${stat.accent}`}
            >
              {stat.label}
            </div>
            <CardValue>{stat.value}</CardValue>
          </Card>
        ))}
      </div>

      {/* Activity rows */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <span className="text-xs text-textSecondary">
              {orders.length} total
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {isLoading ? (
              <p className="text-sm text-textSecondary">Loading...</p>
            ) : recentOrders.length === 0 ? (
              <p className="text-sm text-textSecondary">No orders yet.</p>
            ) : (
              recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-textPrimary">
                      {order.distributorName}
                    </p>
                    <p className="truncate text-xs text-textSecondary">
                      {order.itemsSummary}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-textPrimary">
                      ₹{order.totalAmount.toLocaleString()}
                    </span>
                    <Badge
                      variant={
                        order.status === "approved"
                          ? "approved"
                          : order.status === "processing"
                            ? "processing"
                            : "pending"
                      }
                    >
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Visits */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Visits</CardTitle>
            <span className="text-xs text-textSecondary">
              {visits.length} total
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {isLoading ? (
              <p className="text-sm text-textSecondary">Loading...</p>
            ) : recentVisits.length === 0 ? (
              <p className="text-sm text-textSecondary">No visits logged.</p>
            ) : (
              recentVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-xl border border-border bg-page px-3 py-2.5"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-textPrimary">
                        {visit.firmName || "Unnamed firm"}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          visit.status === "submitted"
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {visit.status}
                      </span>
                    </div>

                    <p className="text-xs text-textSecondary">
                      {formatDate(visit.createdAt)} •{" "}
                      {formatLocation(visit.location)}
                    </p>

                    <p className="text-xs text-textSecondary">
                      {visit.priorities.monthly.length} monthly,{" "}
                      {visit.priorities.annually.length} annual •{" "}
                      {visit.relatedFirms.length} related firms •{" "}
                      {visit.media.length} media
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
