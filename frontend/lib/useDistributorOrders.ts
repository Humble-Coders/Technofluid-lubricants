// File: frontend/lib/useDistributorOrders.ts
"use client";

import { useEffect, useState } from "react";

import type { Order } from "@/types/order";
import { subscribeOrdersByDistributor } from "@/lib/services/orderService";

export function useDistributorOrders(distributorId: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!distributorId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeOrdersByDistributor(
      distributorId,
      (ordersData) => {
        setOrders(ordersData);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to distributor orders:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch orders");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [distributorId]);

  return { orders, loading, error };
}
