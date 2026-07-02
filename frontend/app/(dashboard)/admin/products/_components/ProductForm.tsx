"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { paiseToRupees, rupeesToPaise } from "@/lib/format";
import {
  BASE_UNIT_OPTIONS,
  CATEGORY_OPTIONS,
  PRICE_PER_OPTIONS,
  SEGMENT_OPTIONS,
} from "@/lib/productFieldOptions";
import type { CreateProductPayload } from "@/lib/api/admin";
import type { ProductMaster } from "@/types/productMaster";

export type ProductFormValues = {
  sku: string;
  product: string;
  category: string;
  orderableUnit: string;
  packQty: string;
  baseUnit: string;
  pricePer: string;
  dealerPriceRupees: string;
  distributorPriceRupees: string;
  gstPct: string;
  segment: string;
};

function toFormValues(product?: ProductMaster): ProductFormValues {
  return {
    sku: product?.sku ?? "",
    product: product?.product ?? "",
    category: product?.category ?? CATEGORY_OPTIONS[0].value,
    orderableUnit: product?.orderableUnit ?? "",
    packQty: product ? String(product.packQty) : "",
    baseUnit: product?.baseUnit ?? BASE_UNIT_OPTIONS[0].value,
    pricePer: product?.pricePer ?? PRICE_PER_OPTIONS[0].value,
    dealerPriceRupees: product ? String(paiseToRupees(product.dealerPrice)) : "",
    distributorPriceRupees: product
      ? String(paiseToRupees(product.distributorPrice))
      : "",
    gstPct: product ? String(product.gstPct) : "",
    segment: product?.segment ?? SEGMENT_OPTIONS[0].value,
  };
}

function validate(values: ProductFormValues, skuEditable: boolean): string | null {
  if (skuEditable && !values.sku.trim()) return "SKU is required";
  if (!values.product.trim()) return "Product name is required";
  if (!values.orderableUnit.trim()) return "Orderable unit is required";
  const packQty = Number(values.packQty);
  if (!Number.isFinite(packQty) || packQty <= 0) {
    return "Pack qty must be a number greater than 0";
  }
  const dealerRupees = Number(values.dealerPriceRupees);
  if (!Number.isFinite(dealerRupees) || dealerRupees < 0) {
    return "Dealer price must be a number ≥ 0";
  }
  const distributorRupees = Number(values.distributorPriceRupees);
  if (!Number.isFinite(distributorRupees) || distributorRupees < 0) {
    return "Distributor price must be a number ≥ 0";
  }
  const gstPct = Number(values.gstPct);
  if (!Number.isFinite(gstPct) || gstPct < 0) {
    return "GST % must be a number ≥ 0";
  }
  return null;
}

function toPayloadFields(
  values: ProductFormValues,
): Omit<CreateProductPayload, "sku"> {
  return {
    product: values.product.trim(),
    category: values.category as CreateProductPayload["category"],
    orderableUnit: values.orderableUnit.trim(),
    packQty: Number(values.packQty),
    baseUnit: values.baseUnit as CreateProductPayload["baseUnit"],
    pricePer: values.pricePer as CreateProductPayload["pricePer"],
    dealerPrice: rupeesToPaise(values.dealerPriceRupees),
    distributorPrice: rupeesToPaise(values.distributorPriceRupees),
    gstPct: Number(values.gstPct),
    segment: values.segment as CreateProductPayload["segment"],
  };
}

type ProductFormProps = {
  product?: ProductMaster;
  skuEditable: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateProductPayload) => Promise<void>;
};

export function ProductForm({
  product,
  skuEditable,
  isSubmitting,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(() =>
    toFormValues(product),
  );
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProductFormValues>(key: K, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(values, skuEditable);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await onSubmit({ sku: values.sku.trim(), ...toPayloadFields(values) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Input
        id="sku"
        label="SKU"
        value={values.sku}
        onChange={(e) => set("sku", e.target.value)}
        disabled={!skuEditable}
        required={skuEditable}
      />

      <Input
        id="product"
        label="Product name"
        value={values.product}
        onChange={(e) => set("product", e.target.value)}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          id="category"
          label="Category"
          options={CATEGORY_OPTIONS}
          value={values.category}
          onChange={(e) => set("category", e.target.value)}
        />
        <Select
          id="segment"
          label="Visible to"
          options={SEGMENT_OPTIONS}
          value={values.segment}
          onChange={(e) => set("segment", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="orderableUnit"
          label="Orderable unit"
          value={values.orderableUnit}
          onChange={(e) => set("orderableUnit", e.target.value)}
          placeholder="e.g. 20 L bucket"
          required
        />
        <Input
          id="packQty"
          label="Pack qty"
          type="number"
          min="0"
          step="any"
          value={values.packQty}
          onChange={(e) => set("packQty", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          id="baseUnit"
          label="Base unit"
          options={BASE_UNIT_OPTIONS}
          value={values.baseUnit}
          onChange={(e) => set("baseUnit", e.target.value)}
        />
        <Select
          id="pricePer"
          label="Price per"
          options={PRICE_PER_OPTIONS}
          value={values.pricePer}
          onChange={(e) => set("pricePer", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="dealerPrice"
          label="Dealer price (₹)"
          type="number"
          min="0"
          step="0.01"
          value={values.dealerPriceRupees}
          onChange={(e) => set("dealerPriceRupees", e.target.value)}
          required
        />
        <Input
          id="distributorPrice"
          label="Distributor price (₹)"
          type="number"
          min="0"
          step="0.01"
          value={values.distributorPriceRupees}
          onChange={(e) => set("distributorPriceRupees", e.target.value)}
          required
        />
      </div>

      <Input
        id="gstPct"
        label="GST %"
        type="number"
        min="0"
        step="any"
        value={values.gstPct}
        onChange={(e) => set("gstPct", e.target.value)}
        required
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
