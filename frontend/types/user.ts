// File: frontend/types/user.ts
import type { Timestamp } from "firebase/firestore";

import { USER_ROLES, USER_STATUS } from "@/lib/constants";

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export type FirestoreDateValue = Timestamp | Date | string | null;

export type User = {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  distributorCount?: number;
  ordersCount?: number;
  createdBy?: string | null;
  supervisorId?: string | null;
  approvedBy?: string | null;
  approvedAt?: FirestoreDateValue;
  lastLoginAt?: FirestoreDateValue;
  createdAt?: FirestoreDateValue;
  updatedAt?: FirestoreDateValue;
};

export type CreateUserInput = {
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  createdBy?: string;
};
