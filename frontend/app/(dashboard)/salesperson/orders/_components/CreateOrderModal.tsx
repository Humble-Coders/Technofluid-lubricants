// File: frontend/app/(dashboard)/salesperson/orders/_components/CreateOrderModal.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { validateCoupon, incrementCouponUsage } from "@/lib/services/couponService";
import { createOrder } from "@/lib/services/orderService";
import { useSalespersonDistributors } from "@/lib/useSalespersonDistributors";
import { useAuth } from "@/lib/useAuth";

type CreateOrderModalProps = {
  open: boolean;
  onClose: () => void;
};

type FormErrors = {
  distributorId?: string;
  itemsSummary?: string;
  totalQty?: string;
  totalAmount?: string;
  coupon?: string;
};

export function CreateOrderModal({ open, onClose }: CreateOrderModalProps) {
  const { userData } = useAuth();
  const { distributors } = useSalespersonDistributors(userData?.uid ?? null);

  const [distributorId, setDistributorId] = useState("");
  const [itemsSummary, setItemsSummary] = useState("");
  const [totalQty, setTotalQty] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null);
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const rawTotal = Number(totalAmount) || 0;
  const finalTotal = Math.max(0, rawTotal - discountAmount);

  const reset = () => {
    setDistributorId("");
    setItemsSummary("");
    setTotalQty("");
    setTotalAmount("");
    setCouponCode("");
    setAppliedCouponId(null);
    setAppliedCouponCode(null);
    setDiscountAmount(0);
    setCouponSuccess(null);
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleApplyCoupon = async () => {
    const trimmed = couponCode.trim();
    if (!trimmed) {
      setErrors((prev) => ({ ...prev, coupon: "Enter a coupon code." }));
      return;
    }
    if (rawTotal === 0) {
      setErrors((prev) => ({
        ...prev,
        coupon: "Enter the order amount before applying a coupon.",
      }));
      return;
    }

    setIsValidatingCoupon(true);
    setErrors((prev) => ({ ...prev, coupon: undefined }));
    setCouponSuccess(null);

    try {
      const salespersonName = userData?.name ?? "";
      const result = await validateCoupon(
        trimmed,
        salespersonName,
        "salesperson",
        rawTotal,
      );

      if (!result.valid) {
        setErrors((prev) => ({ ...prev, coupon: result.error }));
      } else {
        const { coupon, discountAmount: discount } = result;
        const label =
          coupon.discountType === "percentage"
            ? `${coupon.discountValue}%`
            : `$${coupon.discountValue}`;
        setCouponSuccess(
          `Applied! You save ${label} ($${discount.toLocaleString()}).`,
        );
        setAppliedCouponId(coupon.id);
        setAppliedCouponCode(trimmed.toUpperCase());
        setDiscountAmount(discount);
      }
    } catch {
      setErrors((prev) => ({
        ...prev,
        coupon: "Failed to validate coupon. Try again.",
      }));
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode("");
    setAppliedCouponId(null);
    setAppliedCouponCode(null);
    setDiscountAmount(0);
    setCouponSuccess(null);
  };

  const handleSubmit = async () => {
    const newErrors: FormErrors = {};
    if (!distributorId) newErrors.distributorId = "Select a distributor.";
    if (!itemsSummary.trim()) newErrors.itemsSummary = "Items summary is required.";
    if (!totalQty || Number(totalQty) <= 0)
      newErrors.totalQty = "Enter a valid quantity.";
    if (!totalAmount || Number(totalAmount) <= 0)
      newErrors.totalAmount = "Enter a valid amount.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!userData) return;

    const distributor = distributors.find((d) => d.uid === distributorId);
    if (!distributor) return;

    setIsSubmitting(true);

    try {
      await createOrder({
        distributorId: distributor.uid,
        distributorName: distributor.name,
        salespersonId: userData.uid,
        itemsSummary: itemsSummary.trim(),
        totalQty: Number(totalQty),
        totalAmount: finalTotal,
        discount: discountAmount,
        couponCode: appliedCouponCode ?? undefined,
      });

      if (appliedCouponId) {
        await incrementCouponUsage(appliedCouponId);
      }

      reset();
      onClose();
    } catch (err) {
      console.error("Failed to create order:", err);
      setErrors({ itemsSummary: "Failed to place order. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const distributorOptions = [
    { label: "Select distributor…", value: "" },
    ...distributors.map((d) => ({ label: d.name, value: d.uid })),
  ];

  return (
    <Modal
      isOpen={open}
      title="Place Order"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={handleSubmit}>
            Place Order · ${finalTotal.toLocaleString()}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          id="order-distributor"
          label="Distributor"
          options={distributorOptions}
          value={distributorId}
          onChange={(e) => {
            setDistributorId(e.target.value);
            setErrors((prev) => ({ ...prev, distributorId: undefined }));
          }}
          error={errors.distributorId}
        />

        <Input
          id="order-items"
          label="Items Summary"
          placeholder="Engine Oil x20, Grease x10"
          value={itemsSummary}
          onChange={(e) => {
            setItemsSummary(e.target.value);
            setErrors((prev) => ({ ...prev, itemsSummary: undefined }));
          }}
          error={errors.itemsSummary}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="order-qty"
            label="Total Qty"
            type="number"
            min={1}
            placeholder="30"
            value={totalQty}
            onChange={(e) => {
              setTotalQty(e.target.value);
              setErrors((prev) => ({ ...prev, totalQty: undefined }));
              // Reset coupon if amount changes
              if (appliedCouponId) handleRemoveCoupon();
            }}
            error={errors.totalQty}
          />
          <Input
            id="order-amount"
            label="Total Amount ($)"
            type="number"
            min={1}
            placeholder="1500"
            value={totalAmount}
            onChange={(e) => {
              setTotalAmount(e.target.value);
              setErrors((prev) => ({ ...prev, totalAmount: undefined }));
              // Reset coupon if amount changes
              if (appliedCouponId) handleRemoveCoupon();
            }}
            error={errors.totalAmount}
          />
        </div>

        {/* Coupon section */}
        <div className="rounded-xl border border-border bg-page p-3 space-y-2">
          <p className="text-sm font-medium text-textPrimary">
            Apply Coupon (optional)
          </p>

          {appliedCouponCode ? (
            <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-success">
                  &quot;{appliedCouponCode}&quot; applied
                </p>
                {couponSuccess ? (
                  <p className="text-xs text-textSecondary">{couponSuccess}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="text-xs text-textSecondary underline hover:text-textPrimary"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="coupon-code-sp"
                  label=""
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setErrors((prev) => ({ ...prev, coupon: undefined }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyCoupon();
                    }
                  }}
                  error={errors.coupon}
                  className="uppercase"
                />
              </div>
              <div className="self-start">
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={isValidatingCoupon}
                  onClick={handleApplyCoupon}
                  disabled={rawTotal === 0}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {discountAmount > 0 && (
            <div className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-textSecondary">Discount</span>
              <span className="text-success">-${discountAmount.toLocaleString()}</span>
            </div>
          )}
          {rawTotal > 0 && (
            <div className="flex justify-between text-sm font-semibold text-textPrimary">
              <span>Final Total</span>
              <span>${finalTotal.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
