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
  currentAddress: string;
  currentLocation: { lat: number; lng: number };
  defaultPriorities: PrioritySet;
  history: FirmHistoryEntry[];
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

export async function getFirmByGst(gstNumber: string): Promise<Firm | null> {
  try {
    if (!gstNumber || !gstNumber.trim()) {
      return null;
    }
    const docRef = doc(db, FIRMS_COLLECTION, gstNumber.trim());
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as Firm) : null;
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
    const firm = await getFirmByGst(gstNumber);
    if (!firm) return false;

    return firm.history.some(
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
    const firm = await getFirmByGst(gstNumber);
    if (!firm) return null;

    const matchingHistory = firm.history.find(
      (entry) => entry.address.trim().toLowerCase() === address.trim().toLowerCase(),
    );

    return matchingHistory?.priorities || firm.defaultPriorities || null;
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

    const newHistoryEntry: FirmHistoryEntry = {
      firmName,
      address,
      location,
      priorities,
      updatedAt: new Date(),
    };

    if (existingFirm.exists()) {
      const firm = existingFirm.data() as Firm;
      const history = firm.history || [];

      const isDuplicate = history.some(
        (entry) =>
          entry.firmName === firmName &&
          entry.address === address &&
          Math.abs(entry.location.lat - location.lat) < 0.001 &&
          Math.abs(entry.location.lng - location.lng) < 0.001,
      );

      if (!isDuplicate) {
        history.push(newHistoryEntry);
      }

      await updateDoc(docRef, {
        currentName: firmName,
        currentAddress: address,
        currentLocation: location,
        defaultPriorities: priorities,
        history,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        gstNumber,
        currentName: firmName,
        currentAddress: address,
        currentLocation: location,
        defaultPriorities: priorities,
        history: [newHistoryEntry],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Error creating/updating firm:", error);
    throw error;
  }
}

// Creates/updates a firm that has no GST number.
// Uses a normalised name as the document ID so repeated visits accumulate history.
export async function saveNoGstFirm(
  name: string,
  address: string,
  location: { lat: number; lng: number },
  priorities: PrioritySet,
): Promise<void> {
  try {
    const docId = `noGST_${name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const docRef = doc(db, FIRMS_COLLECTION, docId);
    const existing = await getDoc(docRef);

    const entry: FirmHistoryEntry = {
      firmName: name.trim(),
      address: address.trim(),
      location,
      priorities,
      updatedAt: new Date(),
    };

    if (existing.exists()) {
      const firm = existing.data() as Firm;
      const history = firm.history || [];
      history.push(entry);
      await updateDoc(docRef, {
        currentName: name.trim(),
        currentAddress: address.trim(),
        currentLocation: location,
        defaultPriorities: priorities,
        history,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        gstNumber: "",
        currentName: name.trim(),
        currentAddress: address.trim(),
        currentLocation: location,
        defaultPriorities: priorities,
        history: [entry],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
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
    return snapshot.docs.map((d) => ({ ...d.data(), gstNumber: d.id }) as Firm);
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
  const payload: Record<string, unknown> = {
    gstNumber: gstNumber.trim().toUpperCase(),
    updatedAt: serverTimestamp(),
  };
  if (name.trim()) payload.currentName = name.trim();
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
    { merge: true }
  );
}
