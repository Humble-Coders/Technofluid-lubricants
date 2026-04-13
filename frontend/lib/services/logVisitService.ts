// File: frontend/lib/services/logVisitService.ts
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { COLLECTIONS } from "@/lib/constants";
import { db, storage } from "@/lib/firebase";
import type { LogVisitInput, MediaItem } from "@/types/visit";

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
