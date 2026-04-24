import {
  doc,
  getDoc,
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
