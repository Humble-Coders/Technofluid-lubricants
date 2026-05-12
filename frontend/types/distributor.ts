// File: frontend/types/distributor.ts
import type { Timestamp } from "firebase/firestore";

import { DISTRIBUTOR_TYPES, USER_STATUS } from "@/lib/constants";

export type DistributorStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export type DistributorType = (typeof DISTRIBUTOR_TYPES)[keyof typeof DISTRIBUTOR_TYPES];

export type FirestoreDateValue = Timestamp | Date | string | null;

/** Structured geographic distribution area */
export type Territory = {
  states: string[];
  districts: string[];
  cities: string[];
};

export type Distributor = {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  serviceArea?: string;
  productCategories?: string[];
  /** Structured geographic territory (replaces/augments serviceArea) */
  territory?: Territory;
  /** Automotive | Industrial | Combined */
  distributorType?: DistributorType;
  /** GSTIN of the linked firm in the firms collection */
  linkedFirmId?: string;
  status: DistributorStatus;
  isActive: boolean;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: FirestoreDateValue;
  lastLoginAt?: FirestoreDateValue;
  contactInfo: string;
  createdAt?: FirestoreDateValue;
  updatedAt?: FirestoreDateValue;
  /** false when created by a salesperson (no auth user yet); true/absent for admin-created */
  authCreated?: boolean;
};

export type CreateDistributorInput = {
  name: string;
  email: string;
  phone: string;
  createdBy: string;
  gstNumber?: string;
  address?: string;
  serviceArea?: string;
  productCategories?: string[];
  distributorType?: DistributorType;
  territory?: Territory;
  linkedFirmId?: string;
};
