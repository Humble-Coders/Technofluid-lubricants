// File: frontend/types/productMaster.ts
import type { Timestamp } from "firebase/firestore";

import type { FirestoreDateValue } from "@/types/product";

export type ProductCategory = "bulk_oil" | "grease" | "retail";

export type ProductBaseUnit = "L" | "kg" | "piece";

export type ProductPricePer =
  | "per litre"
  | "per kg"
  | "per case"
  | "per bucket"
  | "per piece";

export type ProductSegmentTag = "Automotive" | "Industrial" | "Both";

// New products-collection schema (CLAUDE.md Data model rules). Kept separate
// from the legacy `Product` type in types/product.ts, which still feeds the
// mock-driven rate-list/place-order screens.
export type ProductMaster = {
  sku: string; // also the Firestore doc id
  product: string;
  productKey: string;
  category: ProductCategory;
  orderableUnit: string;
  packQty: number;
  baseUnit: ProductBaseUnit;
  pricePer: ProductPricePer;
  dealerPrice: number; // integer paise
  distributorPrice: number; // integer paise
  gstPct: number;
  segment: ProductSegmentTag;
  active: boolean;
  deleted: boolean;
  description?: string;
  imageUrl?: string;
  imagePath?: string;
  createdAt?: FirestoreDateValue | Timestamp;
  updatedAt?: FirestoreDateValue | Timestamp;
};
