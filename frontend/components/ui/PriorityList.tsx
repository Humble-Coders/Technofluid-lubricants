// File: frontend/components/ui/PriorityList.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Product } from "@/types/product";
import type { PriorityItem } from "@/types/visit";
import { ProductSelect } from "@/components/ui/ProductSelect";

// Internal row carries a stable UUID key so React reconciles correctly when
// rows are removed from the middle of the list.
type InternalRow = {
  _key: string;
  productId: string;
  productName: string;
  quantity: string;
};

type PriorityListProps = {
  /** Section label shown above the rows. Omit or pass "" to hide. */
  label?: string;
  products: Product[];
  initialItems?: PriorityItem[];
  resetKey?: string;
  /** Called every time the list changes with cleaned external items. */
  onChange: (items: PriorityItem[]) => void;
  minItems?: number;
  required?: boolean;
  /** Top-level validation error (e.g. "Must have at least 5 items"). */
  error?: string;
};

function makeEmptyRow(): InternalRow {
  return {
    _key: crypto.randomUUID(),
    productId: "",
    productName: "",
    quantity: "1",
  };
}

function toExternal({ _key: _, ...item }: InternalRow): PriorityItem {
  const parsed = parseInt(item.quantity, 10);
  return {
    ...item,
    quantity: Number.isNaN(parsed) ? 0 : parsed,
  };
}

function toInternal(items: PriorityItem[] = []): InternalRow[] {
  return items.map((item) => ({
    _key: crypto.randomUUID(),
    productId: item.productId,
    productName: item.productName,
    quantity: String(item.quantity),
  }));
}

export function PriorityList({
  label,
  products,
  initialItems = [],
  resetKey,
  onChange,
  minItems = 5,
  required = true,
  error,
}: PriorityListProps) {
  const [rows, setRows] = useState<InternalRow[]>(() =>
    toInternal(initialItems),
  );
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    setRows(toInternal(initialItems));
    setDuplicateError(null);
  }, [resetKey]);

  const notify = useCallback(
    (next: InternalRow[]) => onChange(next.map(toExternal)),
    [onChange],
  );

  const addRow = () => {
    setDuplicateError(null);
    const next = [...rowsRef.current, makeEmptyRow()];
    setRows(next);
    notify(next);
  };

  const removeRow = (index: number) => {
    setDuplicateError(null);
    const next = rowsRef.current.filter((_, i) => i !== index);
    setRows(next);
    notify(next);
  };

  const updateProduct = (index: number, pid: string, pname: string) => {
    if (
      pid &&
      rowsRef.current.some(
        (row, rowIndex) => rowIndex !== index && row.productId === pid,
      )
    ) {
      setDuplicateError(
        "This product is already added. Choose a different product.",
      );
      return;
    }

    setDuplicateError(null);
    const next = rowsRef.current.map((r, i) =>
      i === index ? { ...r, productId: pid, productName: pname } : r,
    );
    setRows(next);
    notify(next);
  };

  const updateQuantity = (index: number, raw: string) => {
    setDuplicateError(null);
    const next = rowsRef.current.map((r, i) =>
      i === index ? { ...r, quantity: raw } : r,
    );
    setRows(next);
    notify(next);
  };

  const filled = rows.filter((r) => r.productId).length;
  const stillNeeded = Math.max(0, minItems - rows.length);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {label && (
            <span className="text-sm font-medium text-textPrimary">
              {label}
              {required && <span className="ml-0.5 text-danger">*</span>}
            </span>
          )}
          {rows.length > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                filled >= minItems
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {rows.length}/{minItems}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-semibold text-textPrimary shadow-sm transition hover:bg-page focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add item
        </button>
      </div>

      {/* Validation error */}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {duplicateError && (
        <p className="text-xs font-medium text-danger" role="alert">
          {duplicateError}
        </p>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-page py-5 text-sm text-textSecondary transition hover:border-accent/50 hover:bg-surface hover:text-textPrimary"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {required ? `Add ${minItems} required items` : "Add items (optional)"}
        </button>
      )}

      {/* Rows */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={row._key}
              className="group flex items-center gap-1 rounded-xl border border-border bg-surface p-2 transition hover:border-accent/30"
            >
              {/* Row number */}
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-page text-[10px] font-bold text-textSecondary">
                {index + 1}
              </span>

              {/* Product select */}
              <div className="min-w-0 flex-1">
                <ProductSelect
                  id={`product-${row._key}`}
                  products={products}
                  value={row.productId}
                  productName={row.productName}
                  onSelect={(pid, pname) => updateProduct(index, pid, pname)}
                  placeholder="Search product…"
                />
              </div>

              {/* Quantity */}
              <div className="flex w-12 shrink-0 items-center gap-1 self-center sm:w-18 sm:gap-1.5">
                <label
                  htmlFor={`qty-${row._key}`}
                  className="whitespace-nowrap text-[11px] font-medium text-textSecondary sm:text-xs"
                >
                  Qty
                </label>
                <input
                  id={`qty-${row._key}`}
                  type="number"
                  min={1}
                  step={1}
                  value={row.quantity}
                  onChange={(e) => updateQuantity(index, e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-8 w-7 rounded-lg border border-border bg-page px-1 py-1 text-center text-xs font-semibold text-textPrimary outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20 sm:h-10 sm:w-12 sm:rounded-xl sm:px-2.5 sm:py-2 sm:text-sm"
                />
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="self-center rounded-lg p-1 text-danger/60 transition hover:bg-danger/10 hover:text-danger"
                aria-label="Remove item"
                title="Remove item"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Progress hint */}
      {rows.length > 0 && stillNeeded > 0 && (
        <p className="text-xs text-textSecondary">
          {stillNeeded} more item{stillNeeded > 1 ? "s" : ""} needed
        </p>
      )}
    </div>
  );
}
