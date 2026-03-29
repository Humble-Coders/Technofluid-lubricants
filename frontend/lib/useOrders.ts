// File: frontend/lib/useOrders.ts
"use client";

import { useEffect, useState } from "react";

import type { OrderRow } from "@/app/(dashboard)/admin/_data/mockData";
import { subscribeOrders } from "@/lib/services/orderService";

function toDisplayDate(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate: () => Date };
    return timestamp.toDate().toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeOrders(
      (orderRows) => {
        try {
          const ordersData: OrderRow[] = orderRows.map((order) => ({
            id: order.id,
            distributorName: order.distributorName,
            itemsSummary: order.itemsSummary,
            totalQty: order.totalQty,
            totalAmount: order.totalAmount,
            status: order.status as OrderRow["status"],
            createdAt: toDisplayDate(order.createdAt),
          }));

          setOrders(ordersData);
          setError(null);
          setLoading(false);
        } catch (err) {
          console.error("Error processing orders:", err);
          setError(
            err instanceof Error ? err.message : "Failed to process orders",
          );
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to orders:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch orders");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { orders, loading, error };
}
