// File: frontend/types/order.ts
import type { Timestamp } from "firebase/firestore";

export type OrderStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "cancelled"
  | "delivered"
  | string;

export type FirestoreDateValue = Timestamp | Date | string | null;

export type Order = {
  id: string;
  salespersonId: string;
  distributorName: string;
  itemsSummary: string;
  totalQty: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt?: FirestoreDateValue;
};
