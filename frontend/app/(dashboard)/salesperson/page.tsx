// File: frontend/app/(dashboard)/salesperson/page.tsx
"use client";

import { useAuth } from "@/lib/useAuth";
import { useSalespersonDistributors } from "@/lib/useSalespersonDistributors";
import { useSalespersonOrders } from "@/lib/useSalespersonOrders";
import { useVisits } from "@/lib/useVisits";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function leadBadgeClass(leadType: string) {
  if (leadType === "hot") return "bg-danger/10 text-danger";
  if (leadType === "warm") return "bg-warning/10 text-warning";
  return "bg-info/10 text-info";
}

export default function SalespersonDashboardPage() {
  const { userData } = useAuth();
  const { distributors, loading: distLoading } = useSalespersonDistributors(
    userData?.uid ?? null,
  );
  const { orders, loading: ordLoading } = useSalespersonOrders(
    userData?.uid ?? null,
  );
  const { visits, loading: visitsLoading } = useVisits(userData?.uid ?? null);

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
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 5);

  const recentVisits = visits.slice(0, 5);

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
                  className="flex items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-textPrimary">
                      {visit.distributorName}
                    </p>
                    {visit.notes ? (
                      <p className="truncate text-xs text-textSecondary">
                        {visit.notes.length > 55
                          ? visit.notes.slice(0, 55) + "…"
                          : visit.notes}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${leadBadgeClass(visit.leadType)}`}
                  >
                    {visit.leadType}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
