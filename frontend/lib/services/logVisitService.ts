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
  where,
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

  return {
    name,
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

function mapLogVisit(docSnap: QueryDocumentSnapshot): LogVisit {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    salespersonId: String(data.salespersonId ?? ""),
    salespersonName: String(data.salespersonName ?? ""),
    firmName: String(data.firmName ?? ""),
    status: normalizeStatus(data.status),
    location: normalizeLocation(data.location),
    media: Array.isArray(data.media) ? (data.media as MediaItem[]) : [],
    priorities: normalizePrioritySet(data.priorities),
    relatedFirms: normalizeRelatedFirms(data.relatedFirms),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
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
    firmName: input.firmName,
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

  await setDoc(visitRef, {
    salespersonId,
    salespersonName,
    firmName: input.firmName,
    status: input.status,
    location: input.location,
    media: input.media,
    priorities: input.priorities,
    relatedFirms: input.relatedFirms,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return visitRef.id;
}

export async function updateLogVisit(
  visitId: string,
  input: LogVisitInput,
  salespersonId: string,
  salespersonName: string,
): Promise<void> {
  const visitRef = doc(db, COLLECTIONS.VISITS, visitId);

  await updateDoc(visitRef, {
    ...buildLogVisitData(input, salespersonId, salespersonName),
    updatedAt: serverTimestamp(),
  });
}
