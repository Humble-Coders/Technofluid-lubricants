// File: frontend/lib/services/orderService.ts
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { Order } from "@/types/order";

function mapOrder(docSnap: QueryDocumentSnapshot): Order {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    salespersonId: String(data.salespersonId ?? ""),
    distributorId: data.distributorId ? String(data.distributorId) : undefined,
    distributorName: String(data.distributorName ?? ""),
    itemsSummary: String(data.itemsSummary ?? ""),
    totalQty: Number(data.totalQty ?? 0),
    totalAmount: Number(data.totalAmount ?? 0),
    discount: data.discount ? Number(data.discount) : undefined,
    couponCode: data.couponCode ? String(data.couponCode) : undefined,
    status: String(data.status ?? "pending"),
    createdAt: data.createdAt ?? null,
  };
}

export async function getAllOrders(): Promise<Order[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.ORDERS));
  return snap.docs.map(mapOrder);
}

export function subscribeOrders(
  onChange: (rows: Order[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTIONS.ORDERS),
    (querySnap) => onChange(querySnap.docs.map(mapOrder)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export async function getOrdersBySalesperson(
  salespersonId: string,
): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTIONS.ORDERS),
    where("salespersonId", "==", salespersonId),
  );

  const snap = await getDocs(q);
  return snap.docs.map(mapOrder);
}

export function subscribeOrdersBySalesperson(
  salespersonId: string,
  onChange: (rows: Order[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.ORDERS),
      where("salespersonId", "==", salespersonId),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapOrder)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeOrdersByDistributor(
  distributorId: string,
  onChange: (rows: Order[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.ORDERS),
      where("distributorId", "==", distributorId),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapOrder)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export type CreateOrderInput = {
  distributorId: string;
  distributorName: string;
  salespersonId: string;
  itemsSummary: string;
  totalQty: number;
  totalAmount: number;
  discount?: number;
  couponCode?: string;
};

export async function createOrder(input: CreateOrderInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.ORDERS), {
    distributorId: input.distributorId,
    distributorName: input.distributorName,
    salespersonId: input.salespersonId,
    itemsSummary: input.itemsSummary,
    totalQty: input.totalQty,
    totalAmount: input.totalAmount,
    discount: input.discount ?? 0,
    couponCode: input.couponCode ?? null,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
