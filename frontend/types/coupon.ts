// File: frontend/types/coupon.ts
import type { Timestamp } from "firebase/firestore";

export type FirestoreDateValue = Timestamp | Date | string | null;

export type CouponType = "global" | "targeted";

export type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  targetRole?: "salesperson" | "distributor";
  targetIds?: string[];
  discountType: "percentage" | "flat";
  discountValue: number;
  usageLimit: number; // 0 = unlimited
  usageCount: number;
  status: "active" | "inactive";
  validTill: string;
};

export type CouponValidationResult =
  | { valid: true; coupon: Coupon; discountAmount: number }
  | { valid: false; error: string };
