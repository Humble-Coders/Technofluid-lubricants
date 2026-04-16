// File: frontend/app/(dashboard)/admin/rate-list/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import { useProducts } from "@/lib/useProducts";
import { useRateList } from "@/lib/useRateList";
import {
  deleteRateEntry,
  upsertRateEntry,
} from "@/lib/services/rateListService";
import type { Product } from "@/types/product";
import { SetRateModal } from "./_components/SetRateModal";

type ModalTarget = {
  product: Product;
  existingPrice?: number;
};

export default function AdminRateListPage() {
  const [search, setSearch] = useState("");
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { products, loading: productsLoading } = useProducts();
  const { entries, loading: rateLoading } = useRateList();

  const isLoading = productsLoading || rateLoading;

  const rateMap = useMemo(
    () => new Map(entries.map((e) => [e.productId, e])),
    [entries],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? products.filter((p) => p.name.toLowerCase().includes(q))
      : products;
  }, [products, search]);

  const handleSave = async (product: Product, price: number, unit: string) => {
    await upsertRateEntry(product.id, product.name, price, unit);
  };

  const handleDelete = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      await deleteRateEntry(entryId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <Card>
        <div>
          <Input
            id="rate-search"
            label="Search Products"
            placeholder="Filter by product name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <CardTitle>Total Products</CardTitle>
          <CardValue>{products.length}</CardValue>
        </Card>
        <Card className="p-4">
          <CardTitle>Custom Rates Set</CardTitle>
          <CardValue>{entries.length}</CardValue>
        </Card>
        <Card className="p-4">
          <CardTitle>Using Base Price</CardTitle>
          <CardValue>{Math.max(0, products.length - entries.length)}</CardValue>
        </Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <Card>
          <p className="py-6 text-center text-sm text-textSecondary">
            Loading…
          </p>
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH>Unit</TH>
              <TH>Base Price</TH>
              <TH>Custom Price</TH>
              <TH>Pricing</TH>
              <TH>Action</TH>
            </tr>
          </TableHead>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-textSecondary"
                >
                  No products found.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => {
                const entry = rateMap.get(product.id);
                return (
                  <tr key={product.id}>
                    <TD className="font-medium">{product.name}</TD>
                    <TD className="text-textSecondary">
                      {product.category ?? "—"}
                    </TD>
                    <TD className="text-textSecondary">
                      {entry?.unit ?? product.unit}
                    </TD>
                    <TD className="text-textSecondary">
                      ₹{product.basePrice.toLocaleString()}
                    </TD>
                    <TD className="font-semibold">
                      {entry ? `₹${entry.price.toLocaleString()}` : "—"}
                    </TD>
                    <TD>
                      {entry ? (
                        <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                          Special Rate
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-textSecondary/10 px-2.5 py-1 text-xs font-medium text-textSecondary">
                          Standard
                        </span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="h-8 px-3 text-xs"
                          onClick={() =>
                            setModalTarget({
                              product,
                              existingPrice: entry?.price,
                            })
                          }
                        >
                          {entry ? "Edit" : "Set Price"}
                        </Button>
                        {entry && (
                          <Button
                            variant="danger"
                            className="h-8 px-3 text-xs"
                            disabled={deletingId === entry.id}
                            onClick={() => handleDelete(entry.id)}
                          >
                            {deletingId === entry.id ? "…" : "Remove"}
                          </Button>
                        )}
                      </div>
                    </TD>
                  </tr>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <SetRateModal
        key={modalTarget?.product.id ?? "none"}
        open={!!modalTarget}
        product={modalTarget?.product ?? null}
        existingPrice={modalTarget?.existingPrice}
        onClose={() => setModalTarget(null)}
        onSave={async (price, unit) => {
          if (!modalTarget) return;
          await handleSave(modalTarget.product, price, unit);
        }}
      />
    </section>
  );
}
