// File: frontend/lib/services/couponService.ts
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { Coupon, CouponValidationResult } from "@/types/coupon";

function mapCoupon(id: string, data: Record<string, unknown>): Coupon {
  return {
    id,
    code: String(data.code ?? ""),
    type: (data.type as Coupon["type"]) ?? "global",
    targetRole: data.targetRole as Coupon["targetRole"],
    targetNames: Array.isArray(data.targetNames) ? data.targetNames : [],
    discountType: (data.discountType as Coupon["discountType"]) ?? "percentage",
    discountValue: Number(data.discountValue ?? 0),
    usageLimit: Number(data.usageLimit ?? 0),
    usageCount: Number(data.usageCount ?? 0),
    status: (data.status as Coupon["status"]) ?? "inactive",
    validTill: String(data.validTill ?? ""),
  };
}

export async function validateCoupon(
  code: string,
  userName: string,
  userRole: "salesperson" | "distributor",
  orderTotal: number,
): Promise<CouponValidationResult> {
  const trimmedCode = code.trim().toUpperCase();

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.COUPONS),
      where("code", "==", trimmedCode),
      where("status", "==", "active"),
    ),
  );

  if (snap.empty) {
    return { valid: false, error: "Invalid or inactive coupon code." };
  }

  const docSnap = snap.docs[0];
  const coupon = mapCoupon(docSnap.id, docSnap.data() as Record<string, unknown>);

  // Check expiry
  const today = new Date().toISOString().split("T")[0];
  if (coupon.validTill && coupon.validTill < today) {
    return { valid: false, error: "This coupon has expired." };
  }

  // Check usage limit (0 = unlimited)
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: "This coupon has reached its usage limit." };
  }

  // Check targeted eligibility
  if (coupon.type === "targeted") {
    if (coupon.targetRole !== userRole) {
      return {
        valid: false,
        error: `This coupon is only for ${coupon.targetRole}s.`,
      };
    }
    const isEligible = (coupon.targetNames ?? []).some(
      (name) => name.toLowerCase() === userName.toLowerCase(),
    );
    if (!isEligible) {
      return {
        valid: false,
        error: "This coupon is not available for your account.",
      };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = Math.round((orderTotal * coupon.discountValue) / 100);
  } else {
    discountAmount = Math.min(coupon.discountValue, orderTotal);
  }

  return { valid: true, coupon, discountAmount };
}

export async function incrementCouponUsage(couponId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.COUPONS, couponId), {
    usageCount: increment(1),
  });
}
