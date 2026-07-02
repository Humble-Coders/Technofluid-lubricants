// File: frontend/lib/productFieldOptions.ts
import type {
  ProductBaseUnit,
  ProductCategory,
  ProductPricePer,
  ProductSegmentTag,
} from "@/types/productMaster";

export const CATEGORY_OPTIONS: { label: string; value: ProductCategory }[] = [
  { label: "Bulk oil", value: "bulk_oil" },
  { label: "Grease", value: "grease" },
  { label: "Retail pack", value: "retail" },
];

export const BASE_UNIT_OPTIONS: { label: string; value: ProductBaseUnit }[] = [
  { label: "L", value: "L" },
  { label: "kg", value: "kg" },
  { label: "piece", value: "piece" },
];

export const PRICE_PER_OPTIONS: { label: string; value: ProductPricePer }[] = [
  { label: "per litre", value: "per litre" },
  { label: "per kg", value: "per kg" },
  { label: "per case", value: "per case" },
  { label: "per bucket", value: "per bucket" },
  { label: "per piece", value: "per piece" },
];

export const SEGMENT_OPTIONS: { label: string; value: ProductSegmentTag }[] = [
  { label: "Automotive", value: "Automotive" },
  { label: "Industrial", value: "Industrial" },
  { label: "Both", value: "Both" },
];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  bulk_oil: "Bulk oil",
  grease: "Grease",
  retail: "Retail pack",
};
