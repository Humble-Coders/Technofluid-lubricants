// File: frontend/lib/useCoupons.ts
"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteCoupon as deleteCouponFromDb } from "@/lib/services/couponService";
import type { CouponRow } from "@/app/(dashboard)/admin/_data/mockData";

function mapCouponDoc(id: string, data: Record<string, unknown>): CouponRow {
  return {
    id,
    code: String(data.code ?? ""),
    type: (data.type as CouponRow["type"]) ?? "global",
    targetRole: data.targetRole as CouponRow["targetRole"],
    targetIds: Array.isArray(data.targetIds)
      ? data.targetIds
      : Array.isArray(data.targetNames)
        ? data.targetNames
        : [],
    discountType: (data.discountType as CouponRow["discountType"]) ?? "percentage",
    discountValue: Number(data.discountValue ?? 0),
    usageLimit: Number(data.usageLimit ?? 0),
    usageCount: Number(data.usageCount ?? 0),
    status: (data.status as CouponRow["status"]) ?? "inactive",
    validTill: String(data.validTill ?? ""),
  };
}

export function useCoupons() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "coupons"),
      (querySnapshot) => {
        try {
          setCoupons(
            querySnapshot.docs.map((doc) =>
              mapCouponDoc(doc.id, doc.data() as Record<string, unknown>),
            ),
          );
          setError(null);
          setLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to process coupons");
          setLoading(false);
        }
      },
      (err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch coupons");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const deleteCoupon = async (couponId: string): Promise<void> => {
    await deleteCouponFromDb(couponId);
  };

  const createCoupon = async (couponData: CouponRow): Promise<CouponRow> => {
    const docRef = await addDoc(collection(db, "coupons"), {
      code: couponData.code,
      type: couponData.type,
      targetRole: couponData.targetRole ?? null,
      targetIds: couponData.targetIds ?? [],
      discountType: couponData.discountType,
      discountValue: couponData.discountValue,
      usageLimit: couponData.usageLimit,
      usageCount: 0,
      status: couponData.status,
      validTill: couponData.validTill,
      createdAt: serverTimestamp(),
    });
    return { ...couponData, id: docRef.id, usageCount: 0 };
  };

  return { coupons, loading, error, createCoupon, deleteCoupon };
}
