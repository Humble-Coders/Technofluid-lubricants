import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PrioritySet } from "@/types/visit";
import type { GstVerifiedData } from "@/types/gst";

export type FirmHistoryEntry = {
  firmName: string;
  address: string;
  location: { lat: number; lng: number };
  priorities: PrioritySet;
  updatedAt: any;
};

export type Firm = {
  // ── core ──────────────────────────────────────────────────────────────────
  gstNumber: string;
  currentName: string;
  currentNameLower: string;
  currentAddress: string;
  currentLocation: { lat: number; lng: number };
  defaultPriorities: PrioritySet;
  // history is loaded from the subcollection firms/{id}/history.
  // getAllFirms returns [] here; getFirmByGst loads from subcollection.
  history: FirmHistoryEntry[];
  // present only on noGST documents; undefined on GST-keyed docs.
  normalizedName?: string;
  createdAt: any;
  updatedAt: any;
  // ── from AppyFlow GST verification ────────────────────────────────────────
  legalName?: string;
  tradeName?: string;
  gstStatus?: string;
  registrationDate?: string;
  constitution?: string;
  registeredAddress?: string;
  state?: string;
  pincode?: string;
  gstVerifiedAt?: any;
};

const FIRMS_COLLECTION = "firms";
const HISTORY_SUBCOLLECTION = "history";

// Generates a URL-safe random string of `len` characters using Web Crypto.
function nanoId(len = 10): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// Reads all history entries from the subcollection firms/{firmId}/history.
export async function getFirmHistory(firmId: string): Promise<FirmHistoryEntry[]> {
  const snap = await getDocs(
    collection(db, FIRMS_COLLECTION, firmId, HISTORY_SUBCOLLECTION),
  );
  return snap.docs.map((d) => d.data() as FirmHistoryEntry);
}

// getFirmByGst loads the main firm doc and populates history from the subcollection.
export async function getFirmByGst(gstNumber: string): Promise<Firm | null> {
  try {
    if (!gstNumber || !gstNumber.trim()) return null;
    const docRef = doc(db, FIRMS_COLLECTION, gstNumber.trim());
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const history = await getFirmHistory(gstNumber.trim());
    return { ...(docSnap.data() as Firm), history };
  } catch (error) {
    console.error("Error fetching firm:", error);
    return null;
  }
}

export async function getBranchByGstAndAddress(
  gstNumber: string,
  address: string,
): Promise<boolean> {
  try {
    const trimmed = gstNumber.trim();
    const docRef = doc(db, FIRMS_COLLECTION, trimmed);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return false;

    const history = await getFirmHistory(trimmed);
    return history.some(
      (entry) => entry.address.trim().toLowerCase() === address.trim().toLowerCase(),
    );
  } catch (error) {
    console.error("Error checking branch:", error);
    throw error;
  }
}

export async function getAutoFillPriorities(
  gstNumber: string,
  address: string,
): Promise<PrioritySet | null> {
  try {
    const trimmed = gstNumber.trim();
    const docRef = doc(db, FIRMS_COLLECTION, trimmed);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;

    const firm = docSnap.data() as Firm;
    const history = await getFirmHistory(trimmed);
    const matchingHistory = history.find(
      (entry) => entry.address.trim().toLowerCase() === address.trim().toLowerCase(),
    );

    return matchingHistory?.priorities ?? firm.defaultPriorities ?? null;
  } catch (error) {
    console.error("Error getting auto-fill priorities:", error);
    throw error;
  }
}

export async function createOrUpdateFirm(
  gstNumber: string,
  firmName: string,
  address: string,
  location: { lat: number; lng: number },
  priorities: PrioritySet,
): Promise<void> {
  try {
    const docRef = doc(db, FIRMS_COLLECTION, gstNumber);
    const existingFirm = await getDoc(docRef);

    // Dedup check in subcollection before writing a new history entry.
    const history = await getFirmHistory(gstNumber);
    const isDuplicate = history.some(
      (entry) =>
        entry.firmName === firmName &&
        entry.address === address &&
        Math.abs(entry.location.lat - location.lat) < 0.001 &&
        Math.abs(entry.location.lng - location.lng) < 0.001,
    );

    if (!isDuplicate) {
      const historyRef = doc(
        collection(db, FIRMS_COLLECTION, gstNumber, HISTORY_SUBCOLLECTION),
      );
      await setDoc(historyRef, {
        firmName,
        address,
        location,
        priorities,
        updatedAt: serverTimestamp(),
      });
    }

    if (existingFirm.exists()) {
      await updateDoc(docRef, {
        currentName: firmName,
        currentNameLower: firmName.toLowerCase().trim(),
        currentAddress: address,
        currentLocation: location,
        defaultPriorities: priorities,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        gstNumber,
        currentName: firmName,
        currentNameLower: firmName.toLowerCase().trim(),
        currentAddress: address,
        currentLocation: location,
        defaultPriorities: priorities,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Error creating/updating firm:", error);
    throw error;
  }
}

// Creates/updates a no-GST firm.
// Legacy noGST_ name-based IDs may still exist in DB.
// New docs use noGST_<nanoId(10)> and store normalizedName for querying.
export async function saveNoGstFirm(
  name: string,
  address: string,
  location: { lat: number; lng: number },
  priorities: PrioritySet,
): Promise<void> {
  try {
    const normalizedName = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const docId = `noGST_${nanoId(10)}`;
    const docRef = doc(db, FIRMS_COLLECTION, docId);

    const historyRef = doc(
      collection(db, FIRMS_COLLECTION, docId, HISTORY_SUBCOLLECTION),
    );
    await setDoc(historyRef, {
      firmName: name.trim(),
      address: address.trim(),
      location,
      priorities,
      updatedAt: serverTimestamp(),
    });

    await setDoc(docRef, {
      gstNumber: "",
      normalizedName,
      currentName: name.trim(),
      currentNameLower: name.trim().toLowerCase(),
      currentAddress: address.trim(),
      currentLocation: location,
      defaultPriorities: priorities,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error saving no-GST firm:", error);
    throw error;
  }
}

export async function getAllFirms(): Promise<Firm[]> {
  try {
    const q = query(
      collection(db, FIRMS_COLLECTION),
      orderBy("updatedAt", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        ...data,
        gstNumber: d.id,
        // history lives in the subcollection; provide legacy array as fallback for old docs.
        history: Array.isArray(data.history) ? (data.history as FirmHistoryEntry[]) : [],
      } as Firm;
    });
  } catch (error) {
    console.error("Error fetching all firms:", error);
    throw error;
  }
}

// Saves basic distributor details to the firms cache when a distributor is created manually.
// Uses merge so verified GST data / priorities are never overwritten.
export async function saveDistributorFirmData(
  gstNumber: string,
  name: string,
  address?: string,
): Promise<void> {
  const docRef = doc(db, FIRMS_COLLECTION, gstNumber.trim().toUpperCase());
  const existing = await getDoc(docRef);
  const payload: Record<string, unknown> = {
    gstNumber: gstNumber.trim().toUpperCase(),
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) payload.createdAt = serverTimestamp();
  if (name.trim()) {
    payload.currentName = name.trim();
    payload.currentNameLower = name.trim().toLowerCase();
  }
  if (address?.trim()) payload.currentAddress = address.trim();
  await setDoc(docRef, payload, { merge: true });
}

// Saves a distributor firm without a GST number to the firms collection.
// Uses a random noGST_<nanoId(10)> document ID and stores normalizedName for querying.
// Legacy noGST_ name-based IDs may still exist in DB.
export async function saveDistributorFirmDataNoGst(
  name: string,
  address?: string,
): Promise<void> {
  const normalizedName = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const docId = `noGST_${nanoId(10)}`;
  const docRef = doc(db, FIRMS_COLLECTION, docId);
  const payload: Record<string, unknown> = {
    gstNumber: "",
    normalizedName,
    currentName: name.trim(),
    currentNameLower: name.trim().toLowerCase(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (address?.trim()) payload.currentAddress = address.trim();
  await setDoc(docRef, payload, { merge: true });
}

// Saves (or merges) AppyFlow-verified GST details into the firm document.
// Uses merge so existing priorities/history are never overwritten.
export async function saveFirmGstData(data: GstVerifiedData): Promise<void> {
  const docRef = doc(db, FIRMS_COLLECTION, data.gstin);
  await setDoc(
    docRef,
    {
      gstNumber: data.gstin,
      legalName: data.legalName,
      tradeName: data.tradeName,
      gstStatus: data.status,
      registrationDate: data.registrationDate,
      constitution: data.constitution,
      registeredAddress: data.address,
      state: data.state,
      pincode: data.pincode,
      gstVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
