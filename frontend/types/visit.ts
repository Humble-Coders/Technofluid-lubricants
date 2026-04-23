// File: frontend/types/visit.ts
import type { Timestamp } from "firebase/firestore";

export type LeadType = "hot" | "warm" | "cold";

export type FirestoreDateValue = Timestamp | Date | string | null;

export type Visit = {
  id: string;
  salespersonId: string;
  distributorId: string;
  distributorName: string;
  leadType: LeadType;
  notes: string;
  nextFollowUp: FirestoreDateValue;
  createdAt?: FirestoreDateValue;
  updatedAt?: FirestoreDateValue;
};

export type CreateVisitInput = {
  distributorId: string;
  leadType: LeadType;
  notes: string;
  nextFollowUp: Date;
};

export type UpdateVisitInput = {
  leadType?: LeadType;
  notes?: string;
  nextFollowUp?: Date | null;
};

// ─── Log Visit Feature ────────────────────────────────────────────────────────

export type MediaItem = {
  url: string;
  storagePath: string;
  type: "image" | "video";
  createdAt: string; // ISO string
};

export type PriorityItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type PrioritySet = {
  monthly: PriorityItem[];
  annually: PriorityItem[];
};

export type RelatedFirm = {
  gstNumber?: string;
  name?: string;
  address?: string;
  hasGst: boolean;
  priorities: {
    monthly: PriorityItem[];
    annually: PriorityItem[];
  };
};

export type VisitStatus = "draft" | "submitted";

export type LogVisit = {
  id: string;
  salespersonId: string;
  salespersonName: string;
  gstNumber?: string;
  firmName?: string;
  address?: string;
  hasGst: boolean;
  status: VisitStatus;
  location: { lat: number; lng: number } | null;
  media: MediaItem[];
  priorities: PrioritySet;
  relatedFirms: RelatedFirm[];
  createdAt: FirestoreDateValue;
  updatedAt: FirestoreDateValue;
};

export type LogVisitInput = {
  gstNumber?: string;
  firmName?: string;
  address?: string;
  hasGst: boolean;
  status: VisitStatus;
  location: { lat: number; lng: number } | null;
  media: MediaItem[];
  priorities: PrioritySet;
  relatedFirms: RelatedFirm[];
};
