// File: frontend/app/(dashboard)/distributor/place-order/_components/ProductSelector.tsx
"use client";

import type { Product } from "@/types/product";
import type { OrderItem } from "@/types/product";

type ProductSelectorProps = {
  products: Product[];
  rateMap: Record<string, number>;
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
};

export function ProductSelector({
  products,
  rateMap,
  items,
  onItemsChange,
}: ProductSelectorProps) {
  const getQty = (productId: string): number => {
    return items.find((i) => i.productId === productId)?.quantity ?? 0;
  };

  const handleQtyChange = (product: Product, qty: number) => {
    const unitPrice = rateMap[product.id] ?? product.basePrice;
    const next = items.filter((i) => i.productId !== product.id);

    if (qty > 0) {
      next.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice,
        subtotal: unitPrice * qty,
      });
    }

    onItemsChange(next);
  };

  if (products.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-textSecondary">
        No products available at the moment.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((product) => {
        const unitPrice = rateMap[product.id] ?? product.basePrice;
        const qty = getQty(product.id);

        return (
          <div
            key={product.id}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
              qty > 0
                ? "border-accent/40 bg-accent/5"
                : "border-border bg-surface"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-textPrimary truncate">
                {product.name}
              </p>
              <p className="text-xs text-textSecondary">
                ${unitPrice.toLocaleString()} / {product.unit}
                {product.category ? ` · ${product.category}` : ""}
              </p>
            </div>

            <div className="ml-4 flex items-center gap-3">
              {qty > 0 ? (
                <span className="text-xs font-medium text-accent">
                  ${(unitPrice * qty).toLocaleString()}
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleQtyChange(product, Math.max(0, qty - 1))}
                  disabled={qty === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-textPrimary transition hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <input
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(e) =>
                    handleQtyChange(product, Math.max(0, Number(e.target.value)))
                  }
                  className="w-12 rounded-lg border border-border bg-surface px-1 py-1 text-center text-sm text-textPrimary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  aria-label={`Quantity for ${product.name}`}
                />
                <button
                  type="button"
                  onClick={() => handleQtyChange(product, qty + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-textPrimary transition hover:bg-page"
                  aria-label="Increase quantity"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
