// File: frontend/types/product.ts
import type { Timestamp } from "firebase/firestore";

export type FirestoreDateValue = Timestamp | Date | string | null;

export type Product = {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  unit: string;
  category?: string;
  isActive: boolean;
  createdAt?: FirestoreDateValue;
  updatedAt?: FirestoreDateValue;
};

export type OrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type RateListEntry = {
  id: string;
  productId: string;
  productName: string;
  distributorId: string;
  price: number;
  unit: string;
  effectiveDate?: FirestoreDateValue;
};
