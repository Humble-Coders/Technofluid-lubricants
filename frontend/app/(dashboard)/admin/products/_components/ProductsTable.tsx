"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableHead, TD, TH } from "@/components/ui/table";
import { updateProduct } from "@/lib/api/admin";
import { formatPaise } from "@/lib/format";
import { useProducts } from "@/lib/hooks/useProducts";
import { CATEGORY_LABELS, CATEGORY_OPTIONS, SEGMENT_OPTIONS } from "@/lib/productFieldOptions";
import type { ProductMaster } from "@/types/productMaster";
import { EditProductModal } from "./EditProductModal";
import { NewProductModal } from "./NewProductModal";

const ALL_VALUE = "all";

type SortKey =
  | "sku"
  | "product"
  | "category"
  | "segment"
  | "dealerPrice"
  | "distributorPrice"
  | "active";
type SortDir = "asc" | "desc";

function sortValue(product: ProductMaster, key: SortKey): string | number {
  if (key === "category") return CATEGORY_LABELS[product.category] ?? product.category;
  if (key === "active") return product.active ? 1 : 0;
  const value = product[key];
  return typeof value === "string" ? value.toLowerCase() : value;
}

function SortableTH({
  label,
  sortKey,
  activeSort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = activeSort?.key === sortKey;
  return (
    <TH className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 uppercase tracking-wide hover:text-textPrimary"
      >
        {label}
        {isActive && (
          <span className="text-[10px] leading-none">
            {activeSort!.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </TH>
  );
}

export function ProductsTable() {
  const [showDeleted, setShowDeleted] = useState(false);
  const { products, isLoading, error } = useProducts({
    includeDeleted: showDeleted,
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_VALUE);
  const [segment, setSegment] = useState(ALL_VALUE);
  const [editing, setEditing] = useState<ProductMaster | null>(null);
  const [deleting, setDeleting] = useState<ProductMaster | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = products
      .filter((p) => showDeleted || !p.deleted)
      .filter((p) => category === ALL_VALUE || p.category === category)
      .filter((p) => segment === ALL_VALUE || p.segment === segment)
      .filter(
        (p) =>
          !term ||
          p.product.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term),
      );

    if (!sort) return result;
    const { key, dir } = sort;
    return [...result].sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
  }, [products, search, category, segment, showDeleted, sort]);

  const handleToggleActive = async (product: ProductMaster) => {
    setToggleError(null);
    try {
      await updateProduct({
        sku: product.sku,
        fields: { active: !product.active },
      });
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Failed to update product");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Input
            id="search"
            label="Search"
            placeholder="Search by name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[220px]"
          />
          <Select
            id="category-filter"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ label: "All categories", value: ALL_VALUE }, ...CATEGORY_OPTIONS]}
          />
          <Select
            id="segment-filter"
            label="Segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            options={[{ label: "All segments", value: ALL_VALUE }, ...SEGMENT_OPTIONS]}
          />
          <label className="flex items-center gap-2 pb-2.5 text-sm text-textPrimary">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Show deleted
          </label>
          <div className="ml-auto pb-0.5">
            <Button onClick={() => setIsNewOpen(true)}>New product</Button>
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {toggleError && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {toggleError}
        </p>
      )}

      <Table className="table-fixed text-sm">
        <colgroup>
          <col className="w-32" />
          <col className="w-64" />
          <col className="w-24" />
          <col className="w-20" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-20" />
          <col className="w-48" />
        </colgroup>
        <TableHead>
          <tr>
            <SortableTH label="SKU" sortKey="sku" activeSort={sort} onSort={handleSort} />
            <SortableTH
              label="Product"
              sortKey="product"
              activeSort={sort}
              onSort={handleSort}
            />
            <SortableTH
              label="Category"
              sortKey="category"
              activeSort={sort}
              onSort={handleSort}
            />
            <SortableTH
              label="Segment"
              sortKey="segment"
              activeSort={sort}
              onSort={handleSort}
            />
            <SortableTH
              label="Dealer"
              sortKey="dealerPrice"
              activeSort={sort}
              onSort={handleSort}
            />
            <SortableTH
              label="Distributor"
              sortKey="distributorPrice"
              activeSort={sort}
              onSort={handleSort}
            />
            <SortableTH
              label="Status"
              sortKey="active"
              activeSort={sort}
              onSort={handleSort}
              className="px-2"
            />
            <TH className="px-2">Actions</TH>
          </tr>
        </TableHead>
        <TableBody>
          {isLoading && (
            <tr>
              <td colSpan={8} className="px-4 py-3 text-sm text-textSecondary">
                Loading products...
              </td>
            </tr>
          )}
          {!isLoading && filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-3 text-sm text-textSecondary">
                No products match these filters.
              </td>
            </tr>
          )}
          {filtered.map((product) => (
            <tr key={product.sku}>
              <TD className="truncate" title={product.sku}>
                {product.sku}
              </TD>
              <TD className="truncate" title={product.product}>
                {product.product}
              </TD>
              <TD
                className="truncate"
                title={CATEGORY_LABELS[product.category] ?? product.category}
              >
                {CATEGORY_LABELS[product.category] ?? product.category}
              </TD>
              <TD className="truncate" title={product.segment}>
                {product.segment}
              </TD>
              <TD className="truncate">{formatPaise(product.dealerPrice)}</TD>
              <TD className="truncate">{formatPaise(product.distributorPrice)}</TD>
              <TD className="truncate px-2">
                <div className="flex gap-1">
                  {product.deleted ? (
                    <Badge variant="danger">Deleted</Badge>
                  ) : (
                    <Badge variant={product.active ? "active" : "inactive"}>
                      {product.active ? "Active" : "Inactive"}
                    </Badge>
                  )}
                </div>
              </TD>
              <TD className="px-2">
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(product)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleToggleActive(product)}
                  >
                    {product.active ? "Deactivate" : "Activate"}
                  </Button>
                  {!product.deleted && (
                    <Button size="sm" variant="danger" onClick={() => setDeleting(product)}>
                      Delete
                    </Button>
                  )}
                </div>
              </TD>
            </tr>
          ))}
        </TableBody>
      </Table>

      <EditProductModal
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />

      <NewProductModal
        open={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={() => setIsNewOpen(false)}
      />

      <DeleteConfirmModal
        open={!!deleting}
        name={deleting?.product ?? ""}
        title="Delete product"
        description={`Are you sure you want to soft-delete "${deleting?.product ?? ""}"? It will be hidden from the catalog and removed from its family's public listing if it was the last active variant.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await updateProduct({ sku: deleting.sku, fields: { deleted: true } });
        }}
      />
    </div>
  );
}
