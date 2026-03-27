import {
  collection,
  getDocs,
  onSnapshot,
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
    distributorName: String(data.distributorName ?? ""),
    itemsSummary: String(data.itemsSummary ?? ""),
    totalQty: Number(data.totalQty ?? 0),
    totalAmount: Number(data.totalAmount ?? 0),
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
