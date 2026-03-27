import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";
import type { UserRole } from "@/types/user";

export type CreateUserByAdminPayload = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
};

export type ApproveUserPayload = {
  uid: string;
};

export type RejectUserPayload = {
  uid: string;
  reason?: string;
};

type CreateUserByAdminResponse = {
  success: boolean;
  uid?: string;
};

type MutationResponse = {
  success: boolean;
};

export async function createUserByAdmin(payload: CreateUserByAdminPayload) {
  const callable = httpsCallable<
    CreateUserByAdminPayload,
    CreateUserByAdminResponse
  >(functions, "createUserByAdmin");
  const result = await callable(payload);
  return result.data;
}

export async function approveUser(payload: ApproveUserPayload) {
  const callable = httpsCallable<ApproveUserPayload, MutationResponse>(
    functions,
    "approveUser",
  );
  const result = await callable(payload);
  return result.data;
}

export async function rejectUser(payload: RejectUserPayload) {
  const callable = httpsCallable<RejectUserPayload, MutationResponse>(
    functions,
    "rejectUser",
  );
  const result = await callable(payload);
  return result.data;
}
