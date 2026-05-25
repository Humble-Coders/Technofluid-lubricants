// File: frontend/app/(dashboard)/admin/coupons/_components/CreateCouponModal.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

import { useSalespersons } from "@/lib/useSalespersons";
import { useDistributors } from "@/lib/useDistributors";

import {
  type CouponRow,
  type CouponStatus,
  type CouponTargetRole,
  type CouponType,
} from "../../_data/mockData";
import { createCouponSchema } from "../_lib/couponSchemas";

type CreateCouponModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (coupon: CouponRow) => void;
};

type CouponFormErrors = {
  code?: string;
  discountValue?: string;
  usageLimit?: string;
  validTill?: string;
  targetIds?: string;
};

export function CreateCouponModal({
  open,
  onClose,
  onCreate,
}: CreateCouponModalProps) {
  const { salespersons } = useSalespersons();
  const { distributors } = useDistributors();

  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("global");
  const [targetRole, setTargetRole] = useState<CouponTargetRole>("salesperson");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [targetSearch, setTargetSearch] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "flat">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [usageLimit, setUsageLimit] = useState("0");
  const [validTill, setValidTill] = useState("");
  const [errors, setErrors] = useState<CouponFormErrors>({});

  const roleOptions = useMemo(() => {
    return targetRole === "salesperson"
      ? salespersons.map((s) => ({ id: s.id, name: s.name }))
      : distributors.map((d) => ({ id: d.id, name: d.name }));
  }, [targetRole, salespersons, distributors]);

  const filteredRoleOptions = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    return q
      ? roleOptions.filter((o) => o.name.toLowerCase().includes(q))
      : roleOptions;
  }, [roleOptions, targetSearch]);

  const isTargeted = type === "targeted";
  const isCreateDisabled =
    !code.trim() ||
    !discountValue.trim() ||
    !validTill ||
    (isTargeted && targetIds.length === 0);

  const reset = () => {
    setCode("");
    setType("global");
    setTargetRole("salesperson");
    setTargetIds([]);
    setTargetSearch("");
    setDiscountType("percentage");
    setDiscountValue("");
    setUsageLimit("0");
    setValidTill("");
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTypeChange = (nextType: CouponType) => {
    setType(nextType);
    if (nextType === "global") {
      setTargetRole("salesperson");
      setTargetIds([]);
      setTargetSearch("");
      setErrors((prev) => ({ ...prev, targetIds: undefined }));
    }
  };

  const handleRoleChange = (value: string) => {
    const nextRole = value as CouponTargetRole;
    setTargetRole(nextRole);
    setTargetSearch("");
    setTargetIds([]);
    setErrors((prev) => ({ ...prev, targetIds: undefined }));
  };

  const handleTargetToggle = (id: string) => {
    setErrors((prev) => ({ ...prev, targetIds: undefined }));
    setTargetIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSelectVisible = () => {
    if (filteredRoleOptions.length === 0) return;
    setTargetIds((prev) =>
      Array.from(new Set([...prev, ...filteredRoleOptions.map((o) => o.id)])),
    );
  };

  const handleCreate = () => {
    const parseResult = createCouponSchema.safeParse({
      code,
      type,
      discountType,
      discountValue,
      usageLimit,
      validTill,
      ...(isTargeted ? { targetRole, targetIds } : {}),
    });

    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      setErrors({
        code: fieldErrors.code?.[0],
        discountValue: fieldErrors.discountValue?.[0],
        usageLimit: fieldErrors.usageLimit?.[0],
        validTill: fieldErrors.validTill?.[0],
        targetIds:
          "targetIds" in fieldErrors
            ? fieldErrors.targetIds?.[0]
            : undefined,
      });
      return;
    }

    const parsed = parseResult.data;

    onCreate({
      id: "",
      code: parsed.code.toUpperCase(),
      type: parsed.type,
      targetRole: parsed.type === "targeted" ? parsed.targetRole : undefined,
      targetIds: parsed.type === "targeted" ? parsed.targetIds : undefined,
      discountType: parsed.discountType,
      discountValue: parsed.discountValue,
      usageLimit: parsed.usageLimit,
      usageCount: 0,
      status: "active" as CouponStatus,
      validTill: parsed.validTill,
    });

    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      title="Create Coupon"
      onClose={handleClose}
      mode="workspace"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreateDisabled}>
            Create Coupon
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: Coupon Details ── */}
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-textPrimary">Coupon Details</p>

          <Input
            id="coupon-code"
            label="Coupon Code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setErrors((prev) => ({ ...prev, code: undefined }));
            }}
            placeholder="SUMMER20"
            helperText="Easy-to-remember code, e.g. FESTIVE10"
            error={errors.code}
          />

          <Select
            id="coupon-type"
            label="Type"
            options={[
              { label: "Global (all eligible users)", value: "global" },
              { label: "Targeted (specific users)", value: "targeted" },
            ]}
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as CouponType)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              id="coupon-discount-type"
              label="Discount Type"
              options={[
                { label: "Percentage (%)", value: "percentage" },
                { label: "Flat Amount ($)", value: "flat" },
              ]}
              value={discountType}
              onChange={(e) =>
                setDiscountType(e.target.value as "percentage" | "flat")
              }
            />
            <Input
              id="coupon-discount-value"
              label={discountType === "percentage" ? "Value (%)" : "Value ($)"}
              type="number"
              min={0}
              max={discountType === "percentage" ? 100 : undefined}
              step="0.01"
              value={discountValue}
              onChange={(e) => {
                setDiscountValue(e.target.value);
                setErrors((prev) => ({ ...prev, discountValue: undefined }));
              }}
              placeholder={discountType === "percentage" ? "10" : "25"}
              error={errors.discountValue}
            />
          </div>

          <Input
            id="coupon-usage-limit"
            label="Usage Limit"
            type="number"
            min={0}
            step="1"
            value={usageLimit}
            onChange={(e) => {
              setUsageLimit(e.target.value);
              setErrors((prev) => ({ ...prev, usageLimit: undefined }));
            }}
            helperText="Maximum times this coupon can be used. Set 0 for unlimited."
            error={errors.usageLimit}
          />

          <Input
            id="coupon-valid-till"
            type="date"
            label="Valid Till"
            value={validTill}
            onChange={(e) => {
              setValidTill(e.target.value);
              setErrors((prev) => ({ ...prev, validTill: undefined }));
            }}
            error={errors.validTill}
          />
        </div>

        {/* ── Right: Audience ── */}
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-textPrimary">Audience</p>

          {isTargeted ? (
            <>
              <Select
                id="coupon-target-role"
                label="Target Role"
                options={[
                  { label: "Salesperson", value: "salesperson" },
                  { label: "Distributor", value: "distributor" },
                ]}
                value={targetRole}
                onChange={(e) => handleRoleChange(e.target.value)}
              />

              <div className="space-y-2">
                <p className="block text-sm font-medium text-textPrimary">
                  Select{" "}
                  {targetRole === "salesperson" ? "Salespersons" : "Distributors"}
                </p>
                <Input
                  id="coupon-target-search"
                  label="Search"
                  placeholder={`Search ${
                    targetRole === "salesperson" ? "salespersons" : "distributors"
                  }`}
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-textSecondary">
                    {targetIds.length} selected
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectVisible}
                      className="text-xs font-semibold text-accent hover:brightness-90"
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetIds([])}
                      className="text-xs font-semibold text-textSecondary hover:text-textPrimary"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border p-3">
                  {filteredRoleOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-textSecondary">
                      No matching names found.
                    </p>
                  ) : (
                    filteredRoleOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-textPrimary hover:bg-page"
                      >
                        <input
                          type="checkbox"
                          checked={targetIds.includes(option.id)}
                          onChange={() => handleTargetToggle(option.id)}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
                        />
                        <span>{option.name}</span>
                      </label>
                    ))
                  )}
                </div>

                {targetIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {targetIds.map((id) => {
                      const option = roleOptions.find((o) => o.id === id);
                      return option ? (
                        <span
                          key={id}
                          className="rounded-full border border-border bg-page px-3 py-1 text-xs text-textPrimary"
                        >
                          {option.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                ) : null}

                {errors.targetIds ? (
                  <p className="text-xs font-medium text-danger" role="alert">
                    {errors.targetIds}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-border bg-page px-3 py-2 text-sm text-textSecondary">
              Global coupons apply to all eligible users — both salespersons and
              distributors.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
