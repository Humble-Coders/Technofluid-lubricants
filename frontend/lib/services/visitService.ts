// File: frontend/lib/services/visitService.ts
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { CreateVisitInput, UpdateVisitInput, Visit } from "@/types/visit";

function mapVisit(docSnap: QueryDocumentSnapshot): Visit {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    salespersonId: String(data.salespersonId ?? ""),
    distributorId: String(data.distributorId ?? ""),
    distributorName: String(data.distributorName ?? ""),
    leadType: (data.leadType as Visit["leadType"]) ?? "cold",
    notes: String(data.notes ?? ""),
    nextFollowUp: data.nextFollowUp ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function getAllVisits(): Promise<Visit[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.VISITS));
  return snap.docs.map(mapVisit);
}

export async function getVisitsBySalesperson(
  salespersonId: string,
): Promise<Visit[]> {
  const q = query(
    collection(db, COLLECTIONS.VISITS),
    where("salespersonId", "==", salespersonId),
  );

  const snap = await getDocs(q);
  return snap.docs.map(mapVisit);
}

export function subscribeVisitsBySalesperson(
  salespersonId: string,
  onChange: (rows: Visit[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.VISITS),
      where("salespersonId", "==", salespersonId),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapVisit)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export async function createVisitInFirestore(
  input: CreateVisitInput,
  salespersonId: string,
  distributorName: string,
): Promise<Visit> {
  const visitRef = doc(collection(db, COLLECTIONS.VISITS));

  await setDoc(visitRef, {
    salespersonId,
    distributorId: input.distributorId,
    distributorName,
    leadType: input.leadType,
    notes: input.notes,
    nextFollowUp: input.nextFollowUp,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: visitRef.id,
    salespersonId,
    distributorId: input.distributorId,
    distributorName,
    leadType: input.leadType,
    notes: input.notes,
    nextFollowUp: input.nextFollowUp,
    createdAt: null,
    updatedAt: null,
  };
}

export async function updateVisitInFirestore(
  visitId: string,
  input: UpdateVisitInput,
): Promise<void> {
  const visitRef = doc(db, COLLECTIONS.VISITS, visitId);

  const updateData: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (input.leadType !== undefined) {
    updateData.leadType = input.leadType;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }
  if (input.nextFollowUp !== undefined) {
    updateData.nextFollowUp = input.nextFollowUp;
  }

  await updateDoc(visitRef, updateData);
}

export async function deleteVisitInFirestore(visitId: string): Promise<void> {
  const visitRef = doc(db, COLLECTIONS.VISITS, visitId);
  await deleteDoc(visitRef);
}
