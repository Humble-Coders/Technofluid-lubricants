// File: frontend/lib/constants.ts
export const USER_ROLES = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  SALESPERSON: "salesperson",
  DISTRIBUTOR: "distributor",
} as const;

export const USER_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export const COLLECTIONS = {
  USERS: "users",
  DISTRIBUTORS: "distributors",
  ORDERS: "orders",
  VISITS: "visits",
} as const;

export const ROLE_ROUTES: Record<string, string> = {
  [USER_ROLES.ADMIN]: "/dashboard",
  [USER_ROLES.SALESPERSON]: "/dashboard",
  [USER_ROLES.SUPERVISOR]: "/dashboard",
  [USER_ROLES.DISTRIBUTOR]: "/dashboard",
};
