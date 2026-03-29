// File: frontend/lib/useSalespersonOrders.ts
"use client";

import { useEffect, useState } from "react";

import type { Order } from "@/types/order";
import { subscribeOrdersBySalesperson } from "@/lib/services/orderService";

export function useSalespersonOrders(salespersonId: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!salespersonId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeOrdersBySalesperson(
      salespersonId,
      (ordersData) => {
        setOrders(ordersData);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to orders:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch orders");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [salespersonId]);

  return {
    orders,
    loading,
    error,
  };
}
