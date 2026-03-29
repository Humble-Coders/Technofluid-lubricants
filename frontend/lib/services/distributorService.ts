// File: frontend/lib/services/distributorService.ts
import {
  collection,
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

import { COLLECTIONS, USER_STATUS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { CreateDistributorInput, Distributor } from "@/types/distributor";

function mapDistributor(docSnap: QueryDocumentSnapshot): Distributor {
  const data = docSnap.data();

  return {
    uid: docSnap.id,
    name: String(data.name ?? ""),
    email: data.email ? String(data.email) : "",
    phone: data.phone ? String(data.phone) : "",
    address: data.address ? String(data.address) : "",
    status: (data.status as Distributor["status"]) ?? USER_STATUS.PENDING,
    isActive: Boolean(data.isActive ?? false),
    createdBy: String(data.createdBy ?? ""),
    approvedBy: data.approvedBy ? String(data.approvedBy) : null,
    approvedAt: data.approvedAt ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    contactInfo: String(data.contactInfo ?? data.phone ?? ""),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function getAllDistributors(): Promise<Distributor[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.DISTRIBUTORS));
  return snap.docs.map(mapDistributor);
}

export function subscribeDistributors(
  onChange: (rows: Distributor[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTIONS.DISTRIBUTORS),
    (querySnap) => onChange(querySnap.docs.map(mapDistributor)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export async function approveDistributor(uid: string, approvedBy?: string) {
  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  await updateDoc(distributorRef, {
    status: USER_STATUS.APPROVED,
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createDistributorInFirestore(
  input: CreateDistributorInput,
): Promise<Distributor> {
  const distributorRef = doc(collection(db, COLLECTIONS.DISTRIBUTORS));

  await setDoc(distributorRef, {
    name: input.name,
    phone: input.phone,
    email: input.email,
    status: USER_STATUS.PENDING,
    isActive: true,
    createdBy: input.createdBy,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    contactInfo: input.phone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    uid: distributorRef.id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    status: USER_STATUS.PENDING,
    isActive: true,
    createdBy: input.createdBy,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    contactInfo: input.phone,
    createdAt: null,
    updatedAt: null,
  };
}

export async function getDistributorsBySalesperson(
  salespersonId: string,
): Promise<Distributor[]> {
  const q = query(
    collection(db, COLLECTIONS.DISTRIBUTORS),
    where("createdBy", "==", salespersonId),
  );

  const snap = await getDocs(q);
  return snap.docs.map(mapDistributor);
}

export function subscribeDistributorsBySalesperson(
  salespersonId: string,
  onChange: (rows: Distributor[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.DISTRIBUTORS),
      where("createdBy", "==", salespersonId),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapDistributor)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}
