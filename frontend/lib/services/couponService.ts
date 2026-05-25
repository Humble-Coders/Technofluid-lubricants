// File: frontend/lib/services/couponService.ts
import {
  collection,
  deleteDoc,
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
    // Read targetIds (new field); fall back to legacy targetNames for old docs.
    targetIds: Array.isArray(data.targetIds)
      ? data.targetIds
      : Array.isArray(data.targetNames)
        ? data.targetNames
        : [],
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
  userId: string,
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

  // Check targeted eligibility — match against UIDs stored in targetIds.
  if (coupon.type === "targeted") {
    if (coupon.targetRole !== userRole) {
      return {
        valid: false,
        error: `This coupon is only for ${coupon.targetRole}s.`,
      };
    }
    const isEligible = (coupon.targetIds ?? []).includes(userId);
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

export async function deleteCoupon(couponId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.COUPONS, couponId));
}

/**
 * Run once manually from admin panel, then delete.
 * Reads all targeted coupons, looks up users by name, and rewrites targetIds.
 */
export async function migrateCouponTargetNamesToIds(): Promise<void> {
  const [couponsSnap, usersSnap] = await Promise.all([
    getDocs(
      query(collection(db, COLLECTIONS.COUPONS), where("type", "==", "targeted")),
    ),
    getDocs(collection(db, COLLECTIONS.USERS)),
  ]);

  // Build a case-insensitive name → uid map from the users collection.
  const nameToUid: Record<string, string> = {};
  usersSnap.docs.forEach((d) => {
    const name = String(d.data().name ?? "").trim().toLowerCase();
    if (name) nameToUid[name] = d.id;
  });

  const writes: Promise<void>[] = [];
  for (const couponDoc of couponsSnap.docs) {
    const data = couponDoc.data();
    const names: string[] = Array.isArray(data.targetNames) ? data.targetNames : [];
    if (names.length === 0) continue;

    const ids = names
      .map((n) => nameToUid[n.trim().toLowerCase()])
      .filter((id): id is string => Boolean(id));

    writes.push(
      updateDoc(doc(db, COLLECTIONS.COUPONS, couponDoc.id), { targetIds: ids }),
    );
  }

  await Promise.all(writes);
}
