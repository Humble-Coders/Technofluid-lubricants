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
import { checkTerritoryConflict } from "@/lib/api/admin";
import { saveDistributorFirmData, saveDistributorFirmDataNoGst } from "@/lib/services/firmService";
import type { AssignedProduct, CreateDistributorInput, Distributor, Territory, DistributorType } from "@/types/distributor";

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
    assignedProducts: Array.isArray(data.assignedProducts) ? data.assignedProducts : [],
    status: (data.status as Distributor["status"]) ?? USER_STATUS.PENDING,
    isActive: Boolean(data.isActive ?? false),
    createdBy: String(data.createdBy ?? ""),
    approvedBy: data.approvedBy ? String(data.approvedBy) : null,
    approvedAt: data.approvedAt ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    contactInfo: String(data.phone ?? data.contactInfo ?? ""),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    authCreated: data.authCreated !== false,
    distributorType: data.distributorType ?? undefined,
    territory: data.territory ?? undefined,
    linkedFirmId: data.linkedFirmId ? String(data.linkedFirmId) : undefined,
    deleted: data.deleted === true,
  };
}

export async function getAllDistributors(): Promise<Distributor[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.DISTRIBUTORS), where("deleted", "!=", true)),
  );
  return snap.docs.map(mapDistributor);
}

export function subscribeDistributors(
  onChange: (rows: Distributor[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COLLECTIONS.DISTRIBUTORS), where("deleted", "!=", true)),
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
    assignedProducts?: AssignedProduct[];
    distributorType?: DistributorType;
    territory?: Territory;
    linkedFirmId?: string;
  },
) {
  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (fields.name !== undefined) {
    payload.name = fields.name;
    payload.nameLower = fields.name.toLowerCase().trim();
  }
  if (fields.phone !== undefined) {
    payload.phone = fields.phone;
  }
  if (fields.gstNumber !== undefined) payload.gstNumber = fields.gstNumber;
  if (fields.address !== undefined) payload.address = fields.address;
  if (fields.assignedProducts !== undefined) payload.assignedProducts = fields.assignedProducts;
  if (fields.distributorType !== undefined) payload.distributorType = fields.distributorType;
  if (fields.territory !== undefined) payload.territory = fields.territory;
  if (fields.linkedFirmId !== undefined) payload.linkedFirmId = fields.linkedFirmId;
  await setDoc(distributorRef, payload, { merge: true });
}

export async function approveDistributor(uid: string, approvedBy?: string) {
  const batch = writeBatch(db);

  const distributorRef = doc(db, COLLECTIONS.DISTRIBUTORS, uid);
  batch.update(distributorRef, {
    status: USER_STATUS.APPROVED,
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

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
    nameLower: input.name.toLowerCase().trim(),
    phone: input.phone,
    email: input.email,
    ...(input.gstNumber ? { gstNumber: input.gstNumber } : {}),
    ...(input.address ? { address: input.address } : {}),
    ...(input.assignedProducts?.length ? { assignedProducts: input.assignedProducts } : {}),
    ...(input.distributorType ? { distributorType: input.distributorType } : {}),
    ...(input.territory?.states.length ? { territory: input.territory } : {}),
    ...(input.linkedFirmId ? { linkedFirmId: input.linkedFirmId } : {}),
    status: USER_STATUS.PENDING,
    isActive: true,
    deleted: false,
    createdBy: input.createdBy,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    authCreated: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    if (input.gstNumber) {
      await saveDistributorFirmData(input.gstNumber, input.name, input.address);
    } else {
      await saveDistributorFirmDataNoGst(input.name, input.address);
    }
  } catch (err) {
    console.error("Failed to save firm data for distributor:", err);
  }

  return {
    uid: distributorRef.id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    status: USER_STATUS.PENDING,
    isActive: true,
    deleted: false,
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
      where("deleted", "!=", true),
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
    where("deleted", "!=", true),
  );

  const snap = await getDocs(q);
  return snap.docs.map(mapDistributor);
}

// Soft-deletes a single distributor document (no Auth user exists for this record).
export async function deleteDistributorDoc(uid: string, deletedBy?: string) {
  await updateDoc(doc(db, COLLECTIONS.DISTRIBUTORS, uid), {
    deleted: true,
    deletedAt: serverTimestamp(),
    ...(deletedBy ? { deletedBy } : {}),
  });
}

// Soft-deletes both the distributor and user documents in a single batch.
export async function deleteDistributorAllDocs(uid: string, deletedBy?: string) {
  const softDelete = {
    deleted: true,
    deletedAt: serverTimestamp(),
    ...(deletedBy ? { deletedBy } : {}),
  };
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.DISTRIBUTORS, uid), softDelete);
  batch.update(doc(db, COLLECTIONS.USERS, uid), softDelete);
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

// Delegates conflict checking to the checkTerritoryConflict Cloud Function.
export async function checkTerritoryProductConflict(
  territory: Territory,
  assignedProductIds: string[],
  excludeUid?: string,
): Promise<{ conflicting: boolean; distributorName?: string }> {
  if (!territory.states.length || !assignedProductIds.length) {
    return { conflicting: false };
  }

  const result = await checkTerritoryConflict({
    distributorId: excludeUid,
    states: territory.states,
    cities: territory.cities,
    assignedProductIds,
  });

  return { conflicting: result.conflict };
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
      where("deleted", "!=", true),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapDistributor)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}
