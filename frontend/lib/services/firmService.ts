import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/constants";
import type { PrioritySet } from "@/types/visit";

export type FirmHistoryEntry = {
  firmName: string;
  address: string;
  location: { lat: number; lng: number };
  priorities: PrioritySet;
  updatedAt: any;
};

export type Firm = {
  gstNumber: string;
  currentName: string;
  currentAddress: string;
  currentLocation: { lat: number; lng: number };
  defaultPriorities: PrioritySet;
  history: FirmHistoryEntry[];
  createdAt: any;
  updatedAt: any;
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

export async function getBranchByGstAndLocation(
  gstNumber: string,
  location: { lat: number; lng: number },
  tolerance: number = 0.001,
): Promise<boolean> {
  try {
    const firm = await getFirmByGst(gstNumber);
    if (!firm) return false;

    return firm.history.some(
      (entry) =>
        Math.abs(entry.location.lat - location.lat) < tolerance &&
        Math.abs(entry.location.lng - location.lng) < tolerance,
    );
  } catch (error) {
    console.error("Error checking branch:", error);
    throw error;
  }
}

export async function getAutoFillPriorities(
  gstNumber: string,
  location: { lat: number; lng: number },
  tolerance: number = 0.001,
): Promise<PrioritySet | null> {
  try {
    const firm = await getFirmByGst(gstNumber);
    if (!firm) return null;

    const matchingHistory = firm.history.find(
      (entry) =>
        Math.abs(entry.location.lat - location.lat) < tolerance &&
        Math.abs(entry.location.lng - location.lng) < tolerance,
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
