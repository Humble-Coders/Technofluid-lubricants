// File: frontend/app/(dashboard)/admin/rate-list/_components/SetRateModal.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { Product } from "@/types/product";

type SetRateModalProps = {
  open: boolean;
  product: Product | null;
  existingPrice?: number;
  onClose: () => void;
  onSave: (price: number, unit: string) => Promise<void>;
};

export function SetRateModal({
  open,
  product,
  existingPrice,
  onClose,
  onSave,
}: SetRateModalProps) {
  const [price, setPrice] = useState(existingPrice?.toString() ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = parseFloat(price);
    if (!price.trim() || isNaN(parsed) || parsed < 0) {
      setError("Enter a valid price");
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed, unit.trim() || (product?.unit ?? ""));
      onClose();
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title={existingPrice !== undefined ? "Edit Custom Rate" : "Set Custom Rate"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !price.trim()}>
            {saving ? "Saving..." : "Save Rate"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-page px-4 py-3">
          <p className="text-xs text-textSecondary">Product</p>
          <p className="mt-0.5 text-sm font-semibold text-textPrimary">
            {product?.name ?? "—"}
          </p>
          {product?.category ? (
            <p className="text-xs text-textSecondary">{product.category}</p>
          ) : null}
        </div>

        {existingPrice !== undefined && (
          <div className="rounded-xl border border-border bg-page px-4 py-3">
            <p className="text-xs text-textSecondary">Current Custom Price</p>
            <p className="mt-0.5 text-sm font-semibold text-textPrimary">
              ₹{existingPrice.toLocaleString()}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-page px-4 py-3">
          <p className="text-xs text-textSecondary">Base Price</p>
          <p className="mt-0.5 text-sm font-semibold text-textPrimary">
            ₹{product?.basePrice.toLocaleString() ?? "—"}
          </p>
        </div>

        <Input
          id="rate-price"
          label="Custom Price (₹)"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setError(undefined);
          }}
          placeholder="Enter custom price"
          error={error}
        />

        <Input
          id="rate-unit"
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g. litre, kg, piece"
        />
      </div>
    </Modal>
  );
}
