// File: frontend/app/(dashboard)/admin/products/page.tsx
"use client";

import { useState } from "react";

import { ImportProductsTab } from "./_components/ImportProductsTab";
import { ProductsTable } from "./_components/ProductsTable";

type Tab = "catalog" | "import";

const TABS: { id: Tab; label: string }[] = [
  { id: "catalog", label: "Catalog" },
  { id: "import", label: "Import" },
];

export default function ProductsPage() {
  const [tab, setTab] = useState<Tab>("catalog");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-textPrimary">Products</h1>
        <p className="mt-1 text-sm text-textSecondary">
          View, search, and edit the catalog directly, or bulk-upsert it from
          the product master .xlsx.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? "border-b-2 border-accent text-accent"
                : "text-textSecondary hover:text-textPrimary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "catalog" ? <ProductsTable /> : <ImportProductsTab />}
    </div>
  );
}
