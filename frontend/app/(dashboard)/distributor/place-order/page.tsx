// File: frontend/app/(dashboard)/distributor/place-order/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/useAuth";
import { useProducts } from "@/lib/useProducts";
import { useRateList } from "@/lib/useRateList";
import { createOrder } from "@/lib/services/orderService";
import { incrementCouponUsage } from "@/lib/services/couponService";
import type { OrderItem } from "@/types/product";
import { ProductSelector } from "./_components/ProductSelector";
import { CouponInput } from "./_components/CouponInput";

export default function PlaceOrderPage() {
  const router = useRouter();
  const { userData } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const { entries: rateEntries, loading: rateLoading } = useRateList(
    userData?.uid ?? null,
  );

  const [items, setItems] = useState<OrderItem[]>([]);
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Build distributor-specific price map
  const rateMap: Record<string, number> = {};
  for (const entry of rateEntries) {
    rateMap[entry.productId] = entry.price;
  }

  const rawTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const finalTotal = Math.max(0, rawTotal - discountAmount);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleCouponApply = (code: string, couponId: string, discount: number) => {
    setAppliedCouponCode(code);
    setAppliedCouponId(couponId);
    setDiscountAmount(discount);
  };

  const handleCouponRemove = () => {
    setAppliedCouponCode(null);
    setAppliedCouponId(null);
    setDiscountAmount(0);
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      setSubmitError("Please select at least one product.");
      return;
    }
    if (!userData) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const itemsSummary = items
      .map((item) => `${item.productName} x${item.quantity}`)
      .join(", ");

    try {
      await createOrder({
        distributorId: userData.uid,
        distributorName: userData.name,
        salespersonId: userData.createdBy ?? "",
        itemsSummary,
        totalQty,
        totalAmount: finalTotal,
        discount: discountAmount,
        couponCode: appliedCouponCode ?? undefined,
      });

      // Increment coupon usage counter atomically
      if (appliedCouponId) {
        await incrementCouponUsage(appliedCouponId);
      }

      setSubmitSuccess(true);
      setItems([]);
      setAppliedCouponCode(null);
      setAppliedCouponId(null);
      setDiscountAmount(0);

      setTimeout(() => {
        router.push("/distributor/orders");
      }, 1500);
    } catch (err) {
      console.error("Failed to place order:", err);
      setSubmitError("Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = productsLoading || rateLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        Loading products...
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-success"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-textPrimary">
          Order Placed Successfully!
        </h2>
        <p className="mt-2 text-sm text-textSecondary">
          Redirecting to your orders...
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <Card>
        <h3 className="mb-4 text-base font-semibold text-textPrimary">
          Select Products
        </h3>
        <ProductSelector
          products={products}
          rateMap={rateMap}
          items={items}
          onItemsChange={setItems}
        />
      </Card>

      {items.length > 0 ? (
        <Card>
          <h3 className="mb-4 text-base font-semibold text-textPrimary">
            Apply Coupon
          </h3>
          <CouponInput
            userName={userData?.name ?? ""}
            userRole="distributor"
            orderTotal={rawTotal}
            onApply={handleCouponApply}
            onRemove={handleCouponRemove}
            appliedCode={appliedCouponCode}
          />
        </Card>
      ) : null}

      <Card>
        <h3 className="mb-4 text-base font-semibold text-textPrimary">
          Order Summary
        </h3>

        {items.length === 0 ? (
          <p className="text-sm text-textSecondary">
            No items selected. Add products above to place an order.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.productId}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-textPrimary">
                    {item.productName}
                  </p>
                  <p className="text-xs text-textSecondary">
                    {item.quantity} × ${item.unitPrice.toLocaleString()}
                  </p>
                </div>
                <p className="text-sm font-semibold text-textPrimary">
                  ${item.subtotal.toLocaleString()}
                </p>
              </div>
            ))}

            <div className="space-y-1 border-t border-border pt-3">
              <div className="flex justify-between text-sm text-textSecondary">
                <span>Subtotal</span>
                <span>${rawTotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 ? (
                <div className="flex justify-between text-sm text-success">
                  <span>
                    Discount
                    {appliedCouponCode ? ` (${appliedCouponCode})` : ""}
                  </span>
                  <span>-${discountAmount.toLocaleString()}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold text-textPrimary">
                <span>Total</span>
                <span>${finalTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {submitError ? (
          <p className="mt-3 text-sm font-medium text-danger" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={items.length === 0}
          >
            Place Order · ${finalTotal.toLocaleString()}
          </Button>
        </div>
      </Card>
    </section>
  );
}
