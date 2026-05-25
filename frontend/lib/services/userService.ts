// File: frontend/lib/services/userService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { COLLECTIONS, USER_ROLES, USER_STATUS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { CreateUserInput, User, UserRole } from "@/types/user";

function mapUser(docSnap: QueryDocumentSnapshot): User {
  const data = docSnap.data();

  return {
    uid: docSnap.id,
    email: String(data.email ?? ""),
    name: String(data.name ?? ""),
    phone: data.phone ? String(data.phone) : "",
    role: (data.role as UserRole) ?? USER_ROLES.SALESPERSON,
    status: (data.status as User["status"]) ?? USER_STATUS.PENDING,
    isActive: Boolean(data.isActive ?? false),
    createdBy: data.createdBy ? String(data.createdBy) : null,
    approvedBy: data.approvedBy ? String(data.approvedBy) : null,
    approvedAt: data.approvedAt ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function getUserById(uid: string): Promise<User | null> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    return null;
  }

  return {
    uid: snap.id,
    email: String(snap.data().email ?? ""),
    name: String(snap.data().name ?? ""),
    phone: snap.data().phone ? String(snap.data().phone) : "",
    role: (snap.data().role as UserRole) ?? USER_ROLES.SALESPERSON,
    status: (snap.data().status as User["status"]) ?? USER_STATUS.PENDING,
    isActive: Boolean(snap.data().isActive ?? false),
    createdBy: snap.data().createdBy ? String(snap.data().createdBy) : null,
    approvedBy: snap.data().approvedBy ? String(snap.data().approvedBy) : null,
    approvedAt: snap.data().approvedAt ?? null,
    lastLoginAt: snap.data().lastLoginAt ?? null,
    createdAt: snap.data().createdAt ?? null,
    updatedAt: snap.data().updatedAt ?? null,
  };
}

export async function getAllUsers(): Promise<User[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.USERS));
  return snap.docs.map(mapUser).filter((u) => !u.deleted);
}

export function subscribeUsersByRole(
  role: UserRole,
  onChange: (users: User[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  // Filter `deleted` client-side to avoid requiring a composite Firestore index.
  return onSnapshot(
    query(collection(db, COLLECTIONS.USERS), where("role", "==", role)),
    (querySnap) =>
      onChange(querySnap.docs.map(mapUser).filter((u) => !u.deleted)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export async function updateUser(
  uid: string,
  fields: { name?: string; phone?: string },
) {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  await updateDoc(userRef, { ...fields, updatedAt: serverTimestamp() });
}

export async function approveUser(uid: string, approvedBy?: string) {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  await updateDoc(userRef, {
    status: USER_STATUS.APPROVED,
    approvedBy: approvedBy ?? null,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createUserInFirestore(
  input: CreateUserInput,
  uid?: string,
): Promise<User> {
  const userRef = uid
    ? doc(db, COLLECTIONS.USERS, uid)
    : doc(collection(db, COLLECTIONS.USERS));

  await setDoc(userRef, {
    email: input.email,
    name: input.name,
    phone: input.phone ?? "",
    role: input.role,
    status: USER_STATUS.PENDING,
    isActive: true,
    deleted: false,
    createdBy: input.createdBy ?? null,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    uid: userRef.id,
    email: input.email,
    name: input.name,
    phone: input.phone ?? "",
    role: input.role,
    status: USER_STATUS.PENDING,
    isActive: true,
    createdBy: input.createdBy ?? null,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function getUserOrdersCount(uid: string): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, COLLECTIONS.ORDERS), where("salespersonId", "==", uid)),
  );
  return snap.data().count;
}

export async function getUserDistributorsCount(uid: string): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, COLLECTIONS.DISTRIBUTORS), where("createdBy", "==", uid)),
  );
  return snap.data().count;
}
