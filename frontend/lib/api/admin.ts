// File: frontend/lib/api/admin.ts
import { httpsCallable, FunctionsError } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { UserRole } from "@/types/user";
import type { ProductMaster } from "@/types/productMaster";

export type CreateUserByAdminPayload = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
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

// ✅ NEW: Error handler helper
function handleFirebaseError(error: unknown): Error {
  if (error instanceof FunctionsError) {
    const code = error.code;
    const message = error.message;

    // Map Firebase error codes to user-friendly messages
    switch (code) {
      case "unauthenticated":
        return new Error("You must be logged in to perform this action");
      case "permission-denied":
        return new Error("You don't have permission to perform this action");
      case "invalid-argument":
        return new Error("Invalid input: " + message);
      case "already-exists":
        return new Error("This email is already registered");
      case "not-found":
        return new Error("User not found");
      case "internal":
        return new Error("Server error. Please try again later");
      default:
        return new Error(message || "An error occurred");
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("An unexpected error occurred");
}

export async function createUserByAdmin(
  payload: CreateUserByAdminPayload,
): Promise<CreateUserByAdminResponse> {
  try {
    const callable = httpsCallable<
      CreateUserByAdminPayload,
      CreateUserByAdminResponse
    >(functions, "createUserByAdminCallable");
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}

// ✅ UPDATED: Add error handling
export async function approveUser(
  payload: ApproveUserPayload,
): Promise<MutationResponse> {
  try {
    const callable = httpsCallable<ApproveUserPayload, MutationResponse>(
      functions,
      "approveUser",
    );
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}

// ✅ UPDATED: Add error handling
export async function rejectUser(
  payload: RejectUserPayload,
): Promise<MutationResponse> {
  try {
    const callable = httpsCallable<RejectUserPayload, MutationResponse>(
      functions,
      "rejectUser",
    );
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}

export async function deleteUser(
  payload: ApproveUserPayload,
): Promise<MutationResponse> {
  try {
    const callable = httpsCallable<ApproveUserPayload, MutationResponse>(
      functions,
      "deleteUser",
    );
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}

type ApproveDistributorResponse = {
  success: boolean;
  uid: string;
  email: string;
};

type TerritoryConflictRequest = {
  distributorId?: string;
  states: string[];
  cities: string[];
  assignedProductIds: string[];
};

type TerritoryConflictResponse = {
  conflict: boolean;
  conflictingDistributorId?: string;
};

export async function checkTerritoryConflict(
  payload: TerritoryConflictRequest,
): Promise<TerritoryConflictResponse> {
  try {
    const callable = httpsCallable<
      TerritoryConflictRequest,
      TerritoryConflictResponse
    >(functions, "checkTerritoryConflict");
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}

export type ImportProductsRow = Pick<
  ProductMaster,
  | "sku"
  | "product"
  | "productKey"
  | "category"
  | "orderableUnit"
  | "packQty"
  | "baseUnit"
  | "pricePer"
  | "dealerPrice"
  | "distributorPrice"
  | "gstPct"
  | "segment"
> & { rowNumber: number };

export type ImportProductsResponse = {
  created: number;
  updated: number;
  skipped: number;
  invalid: { rowNumber: number; reason: string }[];
  families: number;
};

export async function importProducts(
  rows: ImportProductsRow[],
): Promise<ImportProductsResponse> {
  try {
    const callable = httpsCallable<
      { rows: ImportProductsRow[] },
      ImportProductsResponse
    >(functions, "importProducts");
    const result = await callable({ rows });
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}

export async function approveDistributorByAdmin(
  distributorId: string,
): Promise<ApproveDistributorResponse> {
  try {
    const callable = httpsCallable<
      { distributorId: string },
      ApproveDistributorResponse
    >(functions, "approveDistributorCallable");
    const result = await callable({ distributorId });
    return result.data;
  } catch (error) {
    throw handleFirebaseError(error);
  }
}