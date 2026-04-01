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
  targetNames?: string;
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
  const [targetNames, setTargetNames] = useState<string[]>([]);
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
    (isTargeted && targetNames.length === 0);

  const reset = () => {
    setCode("");
    setType("global");
    setTargetRole("salesperson");
    setTargetNames([]);
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
      setTargetNames([]);
      setTargetSearch("");
      setErrors((prev) => ({ ...prev, targetNames: undefined }));
    }
  };

  const handleRoleChange = (value: string) => {
    const nextRole = value as CouponTargetRole;
    setTargetRole(nextRole);
    setTargetSearch("");
    setTargetNames([]);
    setErrors((prev) => ({ ...prev, targetNames: undefined }));
  };

  const handleTargetToggle = (name: string) => {
    setErrors((prev) => ({ ...prev, targetNames: undefined }));
    setTargetNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const handleSelectVisible = () => {
    if (filteredRoleOptions.length === 0) return;
    setTargetNames((prev) =>
      Array.from(new Set([...prev, ...filteredRoleOptions.map((o) => o.name)])),
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
      ...(isTargeted ? { targetRole, targetNames } : {}),
    });

    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      setErrors({
        code: fieldErrors.code?.[0],
        discountValue: fieldErrors.discountValue?.[0],
        usageLimit: fieldErrors.usageLimit?.[0],
        validTill: fieldErrors.validTill?.[0],
        targetNames:
          "targetNames" in fieldErrors
            ? fieldErrors.targetNames?.[0]
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
      targetNames: parsed.type === "targeted" ? parsed.targetNames : undefined,
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
                    {targetNames.length} selected
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
                      onClick={() => setTargetNames([])}
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
                          checked={targetNames.includes(option.name)}
                          onChange={() => handleTargetToggle(option.name)}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
                        />
                        <span>{option.name}</span>
                      </label>
                    ))
                  )}
                </div>

                {targetNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {targetNames.map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-border bg-page px-3 py-1 text-xs text-textPrimary"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null}

                {errors.targetNames ? (
                  <p className="text-xs font-medium text-danger" role="alert">
                    {errors.targetNames}
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
