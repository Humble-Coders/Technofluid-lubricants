// File: frontend/app/(dashboard)/salesperson/page.tsx
"use client";

import { useAuth } from "@/lib/useAuth";
import { useSalespersonDistributors } from "@/lib/useSalespersonDistributors";
import { useSalespersonOrders } from "@/lib/useSalespersonOrders";
import { useVisits } from "@/lib/useVisits";
import { Card, CardTitle, CardValue } from "@/components/ui/card";

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        Loading dashboard...
      </div>
    );
  }

  const stats = [
    {
      id: "distributors",
      label: "Total Distributors",
      value: distributors.length.toString(),
    },
    {
      id: "orders",
      label: "Total Orders",
      value: orders.length.toString(),
    },
    {
      id: "visits",
      label: "Recent Visits",
      value: visits.length.toString(),
    },
    {
      id: "totalAmount",
      label: "Total Order Value",
      value: `$${orders.reduce((sum, order) => sum + order.totalAmount, 0).toLocaleString()}`,
    },
  ];

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.id}>
            <CardTitle>{stat.label}</CardTitle>
            <CardValue>{stat.value}</CardValue>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Recent Orders</CardTitle>
          <div className="mt-4">
            {orders.length === 0 ? (
              <p className="text-sm text-textSecondary">No orders yet</p>
            ) : (
              <div className="space-y-3">
                {orders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-textPrimary">
                        {order.distributorName}
                      </p>
                      <p className="text-xs text-textSecondary">
                        {order.itemsSummary}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-textPrimary">
                        ${order.totalAmount.toLocaleString()}
                      </p>
                      <span className="inline-block rounded-full bg-info/10 px-2 py-1 text-xs font-medium text-info">
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Recent Visits</CardTitle>
          <div className="mt-4">
            {visits.length === 0 ? (
              <p className="text-sm text-textSecondary">No visits logged</p>
            ) : (
              <div className="space-y-3">
                {visits.slice(0, 5).map((visit) => (
                  <div
                    key={visit.id}
                    className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-textPrimary">
                        {visit.distributorName}
                      </p>
                      <p className="text-xs text-textSecondary">
                        {visit.notes.substring(0, 50)}
                        {visit.notes.length > 50 ? "..." : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                          visit.leadType === "hot"
                            ? "bg-red-100 text-red-700"
                            : visit.leadType === "warm"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {visit.leadType}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
