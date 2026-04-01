// File: frontend/app/(dashboard)/distributor/page.tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { useDistributorOrders } from "@/lib/useDistributorOrders";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timestamp } from "firebase/firestore";
import type { Order } from "@/types/order";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(value: Order["createdAt"]): string {
  if (!value) return "—";
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : new Date(value as string | Date);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusVariant(status: string) {
  switch (status) {
    case "pending":
      return "pending" as const;
    case "approved":
      return "approved" as const;
    case "dispatched":
      return "info" as const;
    case "delivered":
      return "success" as const;
    default:
      return "secondary" as const;
  }
}

export default function DistributorDashboardPage() {
  const { userData } = useAuth();
  const { orders, loading } = useDistributorOrders(userData?.uid ?? null);

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  const recentOrders = [...orders]
    .sort((a, b) => {
      const aDate = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt as string).getTime();
      const bDate = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt as string).getTime();
      return bDate - aDate;
    })
    .slice(0, 5);

  const stats = [
    {
      id: "total",
      label: "Total Orders",
      value: loading ? "—" : orders.length.toString(),
      accent: "bg-accent/10 text-accent",
    },
    {
      id: "pending",
      label: "Pending",
      value: loading ? "—" : pendingOrders.length.toString(),
      accent: "bg-warning/10 text-warning",
    },
    {
      id: "delivered",
      label: "Delivered",
      value: loading ? "—" : deliveredOrders.length.toString(),
      accent: "bg-success/10 text-success",
    },
    {
      id: "value",
      label: "Total Order Value",
      value: loading ? "—" : `₹${totalValue.toLocaleString()}`,
      accent: "bg-info/10 text-info",
    },
  ];

  return (
    <section className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-textPrimary">
          {getGreeting()}, {userData?.name ?? ""}
        </h2>
        <p className="mt-1 text-sm text-textSecondary">
          Manage your orders and track deliveries.
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Link
              href="/distributor/orders"
              className="text-xs font-medium text-accent hover:brightness-90"
            >
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? (
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
                      {order.itemsSummary}
                    </p>
                    <p className="text-xs text-textSecondary">
                      {formatDate(order.createdAt)} &middot; Qty:{" "}
                      {order.totalQty}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-textPrimary">
                      ₹{order.totalAmount.toLocaleString()}
                    </span>
                    <Badge variant={getStatusVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card className="p-5">
            <CardTitle>Quick Actions</CardTitle>
            <div className="mt-4 space-y-3">
              <Link
                href="/distributor/place-order"
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5 text-sm font-medium text-textPrimary transition hover:bg-surface"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                Place New Order
              </Link>
              <Link
                href="/distributor/orders"
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5 text-sm font-medium text-textPrimary transition hover:bg-surface"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                    <rect x="9" y="3" width="6" height="4" rx="1" />
                    <path d="M9 12h6M9 16h4" />
                  </svg>
                </span>
                View All Orders
              </Link>
              <Link
                href="/distributor/rate-list"
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5 text-sm font-medium text-textPrimary transition hover:bg-surface"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </span>
                View Rate List
              </Link>
            </div>
          </Card>

          {pendingOrders.length > 0 && (
            <Card className="border-warning/30 bg-warning/5 p-5">
              <p className="text-sm font-semibold text-warning">
                {pendingOrders.length} order
                {pendingOrders.length !== 1 ? "s" : ""} awaiting approval
              </p>
              <p className="mt-1 text-xs text-textSecondary">
                Your orders are being reviewed by your salesperson.
              </p>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
