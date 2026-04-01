// File: frontend/app/(dashboard)/distributor/place-order/_components/CouponInput.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateCoupon } from "@/lib/services/couponService";

type CouponInputProps = {
  userName: string;
  userRole: "salesperson" | "distributor";
  orderTotal: number;
  onApply: (code: string, couponId: string, discountAmount: number) => void;
  onRemove: () => void;
  appliedCode: string | null;
};

export function CouponInput({
  userName,
  userRole,
  orderTotal,
  onApply,
  onRemove,
  appliedCode,
}: CouponInputProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleApply = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Please enter a coupon code.");
      return;
    }

    setIsValidating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await validateCoupon(trimmed, userName, userRole, orderTotal);

      if (!result.valid) {
        setError(result.error);
      } else {
        const { coupon, discountAmount } = result;
        const label =
          coupon.discountType === "percentage"
            ? `${coupon.discountValue}%`
            : `$${coupon.discountValue}`;
        setSuccessMessage(
          `Coupon applied! You save ${label} ($${discountAmount.toLocaleString()}).`,
        );
        onApply(trimmed.toUpperCase(), coupon.id, discountAmount);
      }
    } catch {
      setError("Failed to validate coupon. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemove = () => {
    setCode("");
    setError(null);
    setSuccessMessage(null);
    onRemove();
  };

  if (appliedCode) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-success"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-success">
            Coupon &quot;{appliedCode}&quot; applied
          </p>
          {successMessage ? (
            <p className="text-xs text-textSecondary">{successMessage}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="text-xs text-textSecondary underline hover:text-textPrimary"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-textPrimary">Coupon Code</p>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id="coupon-code"
            label=""
            placeholder="Enter coupon code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            error={error ?? undefined}
            className="uppercase"
          />
        </div>
        <div className="self-start">
          <Button
            type="button"
            variant="secondary"
            isLoading={isValidating}
            onClick={handleApply}
            disabled={orderTotal === 0}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
