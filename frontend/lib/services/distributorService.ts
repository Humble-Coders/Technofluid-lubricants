// File: frontend/lib/services/distributorService.ts
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
  writeBatch,
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
    gstNumber: data.gstNumber ? String(data.gstNumber) : undefined,
    serviceArea: data.serviceArea ? String(data.serviceArea) : undefined,
    productCategories: Array.isArray(data.productCategories) ? data.productCategories : [],
    status: (data.status as Distributor["status"]) ?? USER_STATUS.PENDING,
    isActive: Boolean(data.isActive ?? false),
    createdBy: String(data.createdBy ?? ""),
    approvedBy: data.approvedBy ? String(data.approvedBy) : null,
    approvedAt: data.approvedAt ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    contactInfo: String(data.contactInfo ?? data.phone ?? ""),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    // absent on admin-created docs (cloud fn doesn't write it) → treat as true
    authCreated: data.authCreated !== false,
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

export async function updateDistributor(
  uid: string,
  fields: {
    name?: string;
    phone?: string;
    gstNumber?: string;
    address?: string;
    serviceArea?: string;
    productCategories?: string[];
  },
) {
  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (fields.name !== undefined) payload.name = fields.name;
  if (fields.phone !== undefined) {
    payload.phone = fields.phone;
    payload.contactInfo = fields.phone;
  }
  if (fields.gstNumber !== undefined) payload.gstNumber = fields.gstNumber;
  if (fields.address !== undefined) payload.address = fields.address;
  if (fields.serviceArea !== undefined) payload.serviceArea = fields.serviceArea;
  if (fields.productCategories !== undefined) payload.productCategories = fields.productCategories;
  await setDoc(distributorRef, payload, { merge: true });
}

export async function approveDistributor(uid: string, approvedBy?: string) {
  const batch = writeBatch(db);

  // Update distributors collection
  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  batch.update(distributorRef, {
    status: USER_STATUS.APPROVED,
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Also update users collection so the login check passes
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  batch.update(userRef, {
    status: USER_STATUS.APPROVED,
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function createDistributorInFirestore(
  input: CreateDistributorInput,
): Promise<Distributor> {
  const distributorRef = doc(collection(db, COLLECTIONS.DISTRIBUTORS));

  await setDoc(distributorRef, {
    name: input.name,
    phone: input.phone,
    email: input.email,
    ...(input.gstNumber ? { gstNumber: input.gstNumber } : {}),
    ...(input.address ? { address: input.address } : {}),
    ...(input.serviceArea ? { serviceArea: input.serviceArea } : {}),
    ...(input.productCategories?.length ? { productCategories: input.productCategories } : {}),
    status: USER_STATUS.PENDING,
    isActive: true,
    createdBy: input.createdBy,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    contactInfo: input.phone,
    authCreated: false,
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

export async function getDistributorByGst(
  gstNumber: string,
): Promise<{ name: string; address?: string } | null> {
  const normalized = gstNumber.trim().toUpperCase();
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.DISTRIBUTORS),
      where("gstNumber", "==", normalized),
    ),
  );
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    name: String(data.name ?? ""),
    address: data.address ? String(data.address) : undefined,
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

export async function deleteDistributorDoc(uid: string) {
  await deleteDoc(doc(db, COLLECTIONS.DISTRIBUTORS, uid));
}

export async function deleteDistributorAllDocs(uid: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, COLLECTIONS.DISTRIBUTORS, uid));
  batch.delete(doc(db, COLLECTIONS.USERS, uid));
  await batch.commit();
}

export async function approveDistributorRequest(uid: string, approvedBy?: string) {
  await updateDoc(doc(db, COLLECTIONS.DISTRIBUTORS, uid), {
    status: USER_STATUS.APPROVED,
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function checkAreaCategoryConflict(
  serviceArea: string,
  productCategories: string[],
  excludeUid?: string,
): Promise<{ conflicting: boolean; distributorName?: string }> {
  const normalizedArea = serviceArea.trim().toLowerCase();
  const snap = await getDocs(collection(db, COLLECTIONS.DISTRIBUTORS));

  for (const docSnap of snap.docs) {
    if (excludeUid && docSnap.id === excludeUid) continue;
    const data = docSnap.data();
    const docArea = (data.serviceArea ?? "").trim().toLowerCase();
    if (!docArea || docArea !== normalizedArea) continue;

    const docCategories: string[] = Array.isArray(data.productCategories)
      ? data.productCategories
      : [];
    const hasOverlap = productCategories.some((cat) =>
      docCategories.includes(cat),
    );
    if (hasOverlap) {
      return { conflicting: true, distributorName: String(data.name ?? "") };
    }
  }

  return { conflicting: false };
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
