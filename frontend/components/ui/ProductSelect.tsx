// File: frontend/components/ui/ProductSelect.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/types/product";
import { MOCK_PRODUCTS } from "@/lib/mockProducts";

type ProductSelectProps = {
  id: string;
  products: Product[];
  /** Selected product ID — empty string when nothing selected. */
  value: string;
  /** Selected product name (shown in the input). */
  productName: string;
  onSelect: (productId: string, productName: string) => void;
  placeholder?: string;
  /** Optional label rendered above the input. */
  label?: string;
  error?: string;
};

export function ProductSelect({
  id,
  products,
  value,
  productName,
  onSelect,
  placeholder = "Search product…",
  label,
  error,
}: ProductSelectProps) {
  const [query, setQuery] = useState(productName);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const availableProducts = products.length > 0 ? products : MOCK_PRODUCTS;

  // Sync input text when the parent updates productName (e.g. on reset)
  useEffect(() => {
    setQuery(productName);
  }, [productName]);

  // Close and revert on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery(productName);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [productName]);

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? availableProducts.filter((p) =>
        p.name.toLowerCase().includes(trimmedQuery),
      )
    : availableProducts;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
    if (value) onSelect("", ""); // clear committed selection while typing
  };

  const handlePick = (product: Product) => {
    setQuery(product.name);
    setIsOpen(false);
    onSelect(product.id, product.name);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-textPrimary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          className={`w-full rounded-xl border bg-surface py-2.5 pl-8 text-sm text-textPrimary outline-none transition placeholder:text-textSecondary/60 focus:ring-4 focus:ring-accent/20 sm:pl-9 ${
            value ? "pr-10 sm:pr-11" : "pr-3 sm:pr-4"
          } ${
            error
              ? "border-danger focus:border-danger"
              : value
                ? "border-accent/40 focus:border-accent"
                : "border-border focus:border-accent"
          }`}
        />
        {/* Search icon */}
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary/50"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {/* Checkmark when selected */}
        {value && (
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {filtered.length > 0 ? (
            <ul role="listbox" className="max-h-44 overflow-y-auto py-1">
              {filtered.map((product) => (
                <li
                  key={product.id}
                  role="option"
                  aria-selected={product.id === value}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus on input
                    handlePick(product);
                  }}
                  className={`flex min-w-0 cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm transition hover:bg-page sm:px-4 ${
                    product.id === value
                      ? "bg-accent/5 text-accent"
                      : "text-textPrimary"
                  }`}
                >
                  <span
                    className={`block min-w-0 flex-1 truncate ${
                      product.id === value ? "font-semibold" : ""
                    }`}
                    title={product.name}
                  >
                    {product.name}
                  </span>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    {product.unit && (
                      <span className="text-xs text-textSecondary">
                        {product.unit}
                      </span>
                    )}
                    {product.id === value && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-success"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : trimmedQuery ? (
            <div className="px-3 py-3 text-sm text-textSecondary sm:px-4">
              <p>No results for &quot;{query}&quot;</p>
            </div>
          ) : null}
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
