// File: frontend/lib/services/logVisitService.ts
import {
  collection,
  getDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  Timestamp,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { COLLECTIONS } from "@/lib/constants";
import { db, storage } from "@/lib/firebase";
import type {
  FirestoreDateValue,
  LogVisit,
  LogVisitInput,
  MediaItem,
  PriorityItem,
  PrioritySet,
  RelatedFirm,
  VisitStatus,
} from "@/types/visit";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // Only recurse into plain objects — skip class instances (FieldValue,
  // Timestamp, Date, etc.) so Firestore sentinel values are never destroyed.
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function removeUndefined<T>(obj: T): T {
  if (obj === undefined || obj === null) return obj;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined).filter((item) => item !== undefined) as T;
  }
  if (isPlainObject(obj)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeUndefined(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned as T;
  }
  // Class instances (FieldValue, Timestamp, Date, …) pass through unchanged.
  return obj;
}

function normalizeLocation(
  value: unknown,
): { lat: number; lng: number } | null {
  if (!isRecord(value)) return null;

  const lat = Number(value.lat);
  const lng = Number(value.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizePriorityItem(value: unknown): PriorityItem | null {
  if (!isRecord(value)) return null;

  const productId = String(value.productId ?? "").trim();
  const productName = String(value.productName ?? "").trim();
  const quantity = Number(value.quantity ?? 0);

  if (!productId || !productName || !Number.isFinite(quantity)) {
    return null;
  }

  return {
    productId,
    productName,
    quantity: Math.max(1, quantity),
  };
}

function normalizePriorityItems(value: unknown): PriorityItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizePriorityItem)
    .filter((item): item is PriorityItem => Boolean(item));
}

function normalizePrioritySet(value: unknown): PrioritySet {
  if (!isRecord(value)) {
    return { monthly: [], annually: [] };
  }

  return {
    monthly: normalizePriorityItems(value.monthly),
    annually: normalizePriorityItems(value.annually),
  };
}

function normalizeRelatedFirm(value: unknown): RelatedFirm | null {
  if (!isRecord(value)) return null;

  const name = String(value.name ?? "").trim();
  if (!name) return null;

  const gstNumber = String(value.gstNumber ?? "").trim();
  const hasGst =
    typeof value.hasGst === "boolean" ? value.hasGst : gstNumber.length > 0;

  return {
    gstNumber: gstNumber || undefined,
    name,
    hasGst,
    priorities: normalizePrioritySet(value.priorities),
  };
}

function normalizeRelatedFirms(value: unknown): RelatedFirm[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeRelatedFirm)
    .filter((item): item is RelatedFirm => Boolean(item));
}

function normalizeStatus(value: unknown): VisitStatus {
  return value === "submitted" ? "submitted" : "draft";
}

function normalizeTimestamp(value: unknown): FirestoreDateValue {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return value;
  if (typeof value === "string" && value) return value;
  // Anything else (empty map {}, corrupted FieldValue remnant, etc.) → null
  return null;
}

function mapLogVisit(docSnap: QueryDocumentSnapshot): LogVisit {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    salespersonId: String(data.salespersonId ?? ""),
    salespersonName: String(data.salespersonName ?? ""),
    gstNumber: data.gstNumber ? String(data.gstNumber) : undefined,
    firmName: data.firmName ? String(data.firmName) : undefined,
    address: data.address ? String(data.address) : undefined,
    hasGst: Boolean(data.hasGst ?? false),
    status: normalizeStatus(data.status),
    location: normalizeLocation(data.location),
    media: Array.isArray(data.media) ? (data.media as MediaItem[]) : [],
    priorities: normalizePrioritySet(data.priorities),
    relatedFirms: normalizeRelatedFirms(data.relatedFirms),
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}

function buildLogVisitData(
  input: LogVisitInput,
  salespersonId: string,
  salespersonName: string,
) {
  return {
    salespersonId,
    salespersonName,
    gstNumber: input.gstNumber,
    firmName: input.firmName,
    address: input.address,
    hasGst: input.hasGst,
    status: input.status,
    location: input.location,
    media: input.media,
    priorities: input.priorities,
    relatedFirms: input.relatedFirms,
  };
}

/**
 * Uploads a single file to Firebase Storage under visits/{uploaderId}/media/.
 * Returns a complete MediaItem ready to persist in Firestore.
 */
export async function uploadVisitMedia(
  file: File,
  uploaderId: string,
): Promise<MediaItem> {
  const ext = file.name.split(".").pop() ?? "bin";
  const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const storagePath = `visits/${uploaderId}/media/${uniqueName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return {
    url,
    storagePath,
    type: file.type.startsWith("video/") ? "video" : "image",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Deletes a file from Firebase Storage by its storagePath.
 * Silently succeeds if the file no longer exists.
 */
export async function deleteVisitMedia(storagePath: string): Promise<void> {
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}

export async function getLogVisitById(
  visitId: string,
): Promise<LogVisit | null> {
  const visitRef = doc(db, COLLECTIONS.VISITS, visitId);
  const snap = await getDoc(visitRef);

  if (!snap.exists()) {
    return null;
  }

  return mapLogVisit(snap);
}

export async function getLogVisitsBySalesperson(
  salespersonId: string,
): Promise<LogVisit[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.VISITS),
      where("salespersonId", "==", salespersonId),
    ),
  );

  return snap.docs.map(mapLogVisit);
}

export function subscribeLogVisitsBySalesperson(
  salespersonId: string,
  onChange: (rows: LogVisit[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.VISITS),
      where("salespersonId", "==", salespersonId),
    ),
    (querySnap) => onChange(querySnap.docs.map(mapLogVisit)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeAllLogVisits(
  onChange: (rows: LogVisit[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTIONS.VISITS),
    (querySnap) => onChange(querySnap.docs.map(mapLogVisit)),
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

/**
 * Persists a new log visit document to the visits Firestore collection.
 * Returns the generated document ID.
 */
export async function createLogVisit(
  input: LogVisitInput,
  salespersonId: string,
  salespersonName: string,
): Promise<string> {
  const visitRef = doc(collection(db, COLLECTIONS.VISITS));

  const data = removeUndefined({
    ...buildLogVisitData(input, salespersonId, salespersonName),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(visitRef, data);

  return visitRef.id;
}

export async function updateLogVisit(
  visitId: string,
  input: LogVisitInput,
  salespersonId: string,
  salespersonName: string,
): Promise<void> {
  const visitRef = doc(db, COLLECTIONS.VISITS, visitId);

  const data = removeUndefined({
    ...buildLogVisitData(input, salespersonId, salespersonName),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(visitRef, data);
}

export async function deleteVisitInFirestore(visitId: string): Promise<void> {
  const visitRef = doc(db, COLLECTIONS.VISITS, visitId);
  await deleteDoc(visitRef);
}
