// File: frontend/app/(dashboard)/distributor/rate-list/page.tsx
"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/useAuth";
import { useProducts } from "@/lib/useProducts";
import { useRateList } from "@/lib/useRateList";
import { RateListTable } from "./_components/RateListTable";

export default function RateListPage() {
  const { userData } = useAuth();
  const [search, setSearch] = useState("");

  const { products, loading: productsLoading } = useProducts();
  const { entries, loading: rateLoading } = useRateList(userData?.uid ?? null);

  const isLoading = productsLoading || rateLoading;

  const filteredProducts = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : products;

  const customRatesCount = entries.length;

  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">
              Total Products
            </p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {products.length}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">
              Special Rates
            </p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {customRatesCount}
            </p>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm font-medium text-textSecondary">
              Standard Rates
            </p>
            <p className="mt-1 text-2xl font-bold text-textPrimary">
              {Math.max(0, products.length - customRatesCount)}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4">
          <Input
            id="rate-search"
            label="Search Products"
            placeholder="Search by product name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <RateListTable
          entries={entries}
          products={filteredProducts}
          loading={isLoading}
        />
      </Card>
    </section>
  );
}
