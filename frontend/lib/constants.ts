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
} as const;
