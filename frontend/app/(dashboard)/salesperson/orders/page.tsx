"use client";

import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/useAuth";
import { useSalespersonOrders } from "@/lib/useSalespersonOrders";
import { OrdersTable } from "./_components/OrdersTable";

export default function SalespersonOrdersPage() {
  const { userData } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "dispatched" | "delivered"
  >("all");
  const [page, setPage] = useState(1);

  const resetPage = () => setPage(1);
  const { orders, loading, error } = useSalespersonOrders(
    userData?.uid ?? null,
  );

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let filtered = orders;

    if (normalizedSearch) {
      filtered = filtered.filter((order) => {
        return (
          order.distributorName.toLowerCase().includes(normalizedSearch) ||
          order.itemsSummary.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    return filtered;
  }, [orders, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const paginatedOrders = filteredOrders.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        Error loading orders: {error}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">
              Total Orders
            </p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {orders.length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">Pending</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {orders.filter((o) => o.status === "pending").length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">Approved</p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {orders.filter((o) => o.status === "approved").length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">
              Total Value
            </p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              $
              {orders
                .reduce((sum, o) => sum + o.totalAmount, 0)
                .toLocaleString()}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="order-search"
            label="Search"
            placeholder="Search by distributor or items"
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); resetPage(); }}
          />
          <Select
            id="order-status"
            label="Filter by Status"
            options={[
              { label: "All", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
              { label: "Dispatched", value: "dispatched" },
              { label: "Delivered", value: "delivered" },
            ]}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(
                e.target.value as
                  | "all"
                  | "pending"
                  | "approved"
                  | "rejected"
                  | "dispatched"
                  | "delivered",
              );
              resetPage();
            }}
          />
        </div>
      </Card>

      <Card>
        <OrdersTable orders={paginatedOrders} loading={loading} />
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-textSecondary">
            <span>
              Page {page} of {totalPages} ({filteredOrders.length} results)
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
