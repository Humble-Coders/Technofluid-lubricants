"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { type CouponRow } from "../_data/mockData";
import { useCoupons } from "@/lib/useCoupons";
import { CouponsTable } from "./_components/CouponsTable";
import { CreateCouponModal } from "./_components/CreateCouponModal";

export default function CouponsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const { coupons, createCoupon } = useCoupons();

  const handleCreate = async (coupon: CouponRow) => {
    try {
      await createCoupon(coupon);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create coupon:", err);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-end">
        <Button onClick={() => setIsOpen(true)}>Create Coupon</Button>
      </div>

      <CouponsTable coupons={coupons} />

      <CreateCouponModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onCreate={handleCreate}
      />
    </section>
  );
}
