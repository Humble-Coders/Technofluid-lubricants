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
