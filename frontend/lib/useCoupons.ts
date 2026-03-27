"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import type { CouponRow } from "@/app/(dashboard)/admin/_data/mockData";

export function useCoupons() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const couponsCollection = collection(db, "coupons");

    const unsubscribe = onSnapshot(
      couponsCollection,
      (querySnapshot) => {
        try {
          const couponsData: CouponRow[] = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            code: doc.data().code,
            type: doc.data().type,
            targetRole: doc.data().targetRole,
            targetNames: doc.data().targetNames || [],
            discount: doc.data().discount,
            status: doc.data().status,
            validTill: doc.data().validTill,
          }));

          setCoupons(couponsData);
          setError(null);
          setLoading(false);
        } catch (err) {
          console.error("Error processing coupons:", err);
          setError(
            err instanceof Error ? err.message : "Failed to process coupons",
          );
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to coupons:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch coupons",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const createCoupon = async (couponData: CouponRow) => {
    try {
      // Add to local state immediately
      setCoupons((prev) => [couponData, ...prev]);
      return couponData;
    } catch (err) {
      console.error("Error creating coupon:", err);
      throw err;
    }
  };

  return { coupons, loading, error, createCoupon };
}
