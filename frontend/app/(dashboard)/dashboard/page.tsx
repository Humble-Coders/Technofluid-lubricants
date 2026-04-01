// File: frontend/app/(dashboard)/dashboard/page.tsx
"use client";

import { useAuth } from "@/lib/useAuth";
import { useOrders } from "@/lib/useOrders";
import { useSalespersons } from "@/lib/useSalespersons";
import { useDistributors } from "@/lib/useDistributors";
import { useSupervisors } from "@/lib/useSupervisors";
import { USER_ROLES } from "@/lib/constants";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import SalespersonDashboardPage from "@/app/(dashboard)/salesperson/page";
import DistributorDashboardPage from "@/app/(dashboard)/distributor/page";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { userData } = useAuth();

  if (userData?.role === USER_ROLES.SALESPERSON) {
    return <SalespersonDashboardPage />;
  }

  if (userData?.role === USER_ROLES.DISTRIBUTOR) {
    return <DistributorDashboardPage />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { userData } = useAuth();
  const { orders, loading: ordersLoading } = useOrders();
  const { salespersons, loading: spLoading } = useSalespersons();
  const { distributors, loading: distLoading } = useDistributors();
  const { supervisors, loading: supLoading } = useSupervisors();

  const isLoading = ordersLoading || spLoading || distLoading || supLoading;

  const pendingApprovals =
    salespersons.filter((s) => s.status === "pending").length +
    distributors.filter((d) => d.status === "pending").length +
    supervisors.filter((s) => s.status === "pending").length;

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const recentOrders = [...orders]
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 5);

  const pendingOrdersList = orders
    .filter((o) => o.status === "pending")
    .slice(0, 5);

  const stats = [
    {
      id: "orders",
      label: "Total Orders",
      value: isLoading ? "—" : orders.length.toString(),
      accent: "bg-accent/10 text-accent",
    },
    {
      id: "distributors",
      label: "Distributors",
      value: isLoading ? "—" : distributors.length.toString(),
      accent: "bg-info/10 text-info",
    },
    {
      id: "salespersons",
      label: "Salespersons",
      value: isLoading ? "—" : salespersons.length.toString(),
      accent: "bg-success/10 text-success",
    },
    {
      id: "pending",
      label: "Pending Approvals",
      value: isLoading ? "—" : pendingApprovals.toString(),
      accent: "bg-warning/10 text-warning",
    },
  ];

  return (
    <section className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-textPrimary">
          {getGreeting()}, {userData?.name ?? "Admin"}
        </h2>
        <p className="mt-1 text-sm text-textSecondary">
          Here&rsquo;s an overview of your operations.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.id} className="flex items-start gap-4 p-5">
            <div className={`mt-0.5 rounded-xl p-2.5 ${stat.accent}`}>
              <div className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{stat.label}</CardTitle>
              <CardValue>{stat.value}</CardValue>
            </div>
          </Card>
        ))}
      </div>

      {/* Revenue banner */}
      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-textSecondary">
            Total Revenue
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-textPrimary">
            ₹{isLoading ? "—" : totalRevenue.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-textSecondary">
            Across {orders.length} order{orders.length !== 1 ? "s" : ""}
          </p>
        </div>
      </Card>

      {/* Two-column section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <span className="text-xs text-textSecondary">
              {orders.length} total
            </span>
          </div>
          <div className="mt-4 space-y-3">
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

        {/* Pending Approvals */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Pending Approvals</CardTitle>
            {pendingApprovals > 0 && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                {pendingApprovals}
              </span>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-textSecondary">Loading...</p>
            ) : pendingApprovals === 0 ? (
              <p className="text-sm text-textSecondary">
                All approvals are up to date.
              </p>
            ) : (
              <>
                {salespersons
                  .filter((s) => s.status === "pending")
                  .slice(0, 3)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-textPrimary">
                          {s.name}
                        </p>
                        <p className="text-xs text-textSecondary">
                          Salesperson
                        </p>
                      </div>
                      <Badge variant="pending">pending</Badge>
                    </div>
                  ))}
                {distributors
                  .filter((d) => d.status === "pending")
                  .slice(0, 3)
                  .map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-page px-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info/10 text-xs font-bold text-info">
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-textPrimary">
                          {d.name}
                        </p>
                        <p className="text-xs text-textSecondary">
                          Distributor
                        </p>
                      </div>
                      <Badge variant="pending">pending</Badge>
                    </div>
                  ))}
              </>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
