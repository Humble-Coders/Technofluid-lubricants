// File: frontend/app/(dashboard)/admin/orders/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";

import { type OrderStatus } from "../_data/mockData";
import { useOrders } from "@/lib/useOrders";
import { OrdersFilters } from "./_components/OrdersFilters";
import { OrdersTable } from "./_components/OrdersTable";

export default function OrdersPage() {
  const { orders } = useOrders();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");

  const filteredOrders = useMemo(() => {
    let rows = orders;

    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (normalizedSearch) {
      rows = rows.filter((order) => {
        const distributorName = order.distributorName.toLowerCase();
        const itemsSummary = order.itemsSummary.toLowerCase();
        return (
          distributorName.includes(normalizedSearch) ||
          itemsSummary.includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((order) => order.status === statusFilter);
    }

    if (dateRangeFilter !== "all") {
      const dayWindow = Number(dateRangeFilter);
      rows = rows.filter((order) => {
        const createdAt = new Date(order.createdAt).getTime();
        const now = new Date("2026-03-27").getTime();
        const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
        return diffDays <= dayWindow;
      });
    }

    return rows;
  }, [orders, searchQuery, statusFilter, dateRangeFilter]);

  const handleStatusUpdate = (orderId: string, value: OrderStatus) => {
    // TODO: Update order status in Firestore
    console.log(`Update order ${orderId} status to ${value}`);
  };

  return (
    <section className="space-y-5">
      <Card>
        <OrdersFilters
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          dateRangeFilter={dateRangeFilter}
          onSearchChange={setSearchQuery}
          onStatusChange={setStatusFilter}
          onDateRangeChange={setDateRangeFilter}
        />
      </Card>

      <OrdersTable
        orders={filteredOrders}
        onStatusChange={handleStatusUpdate}
      />
    </section>
  );
}
