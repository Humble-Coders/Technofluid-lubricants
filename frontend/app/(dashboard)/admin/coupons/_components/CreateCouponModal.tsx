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
  discount?: string;
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
  const [discount, setDiscount] = useState("");
  const [validTill, setValidTill] = useState("");
  const [errors, setErrors] = useState<CouponFormErrors>({});

  const roleOptions = useMemo(() => {
    return targetRole === "salesperson"
      ? salespersons.map((salesperson) => ({
          id: salesperson.id,
          name: salesperson.name,
        }))
      : distributors.map((distributor) => ({
          id: distributor.id,
          name: distributor.name,
        }));
  }, [targetRole, salespersons, distributors]);

  const filteredRoleOptions = useMemo(() => {
    const normalizedSearch = targetSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return roleOptions;
    }

    return roleOptions.filter((option) =>
      option.name.toLowerCase().includes(normalizedSearch),
    );
  }, [roleOptions, targetSearch]);

  const isTargeted = type === "targeted";
  const isCreateDisabled =
    !code.trim() ||
    !discount.trim() ||
    !validTill ||
    (isTargeted && targetNames.length === 0);

  const reset = () => {
    setCode("");
    setType("global");
    setTargetRole("salesperson");
    setTargetNames([]);
    setTargetSearch("");
    setDiscount("");
    setValidTill("");
    setErrors({});
  };

  const handleTypeChange = (nextType: CouponType) => {
    setType(nextType);
    if (nextType === "global") {
      setTargetRole("salesperson");
      setTargetNames([]);
      setTargetSearch("");
      setErrors((prev) => ({ ...prev, targetNames: undefined }));
      return;
    }

    const defaultSalesperson = salespersons[0]?.name;
    setTargetRole("salesperson");
    setTargetNames(defaultSalesperson ? [defaultSalesperson] : []);
  };

  const handleRoleChange = (value: string) => {
    const nextRole = value as CouponTargetRole;
    setTargetRole(nextRole);
    setTargetSearch("");
    setErrors((prev) => ({ ...prev, targetNames: undefined }));

    const nextDefaultName =
      nextRole === "salesperson"
        ? salespersons[0]?.name
        : distributors[0]?.name;
    setTargetNames(nextDefaultName ? [nextDefaultName] : []);
  };

  const handleTargetToggle = (name: string) => {
    setErrors((prev) => ({ ...prev, targetNames: undefined }));
    setTargetNames((prev) =>
      prev.includes(name)
        ? prev.filter((item) => item !== name)
        : [...prev, name],
    );
  };

  const handleSelectVisible = () => {
    if (filteredRoleOptions.length === 0) {
      return;
    }

    setTargetNames((prev) => {
      const visibleNames = filteredRoleOptions.map((option) => option.name);
      return Array.from(new Set([...prev, ...visibleNames]));
    });
  };

  const handleClearSelected = () => {
    setTargetNames([]);
  };

  const handleCreate = () => {
    const parseResult = createCouponSchema.safeParse({
      code,
      type,
      discount,
      validTill,
      ...(isTargeted ? { targetRole, targetNames } : {}),
    });

    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const targetNamesError =
        "targetNames" in fieldErrors ? fieldErrors.targetNames?.[0] : undefined;
      setErrors({
        code: fieldErrors.code?.[0],
        discount: fieldErrors.discount?.[0],
        validTill: fieldErrors.validTill?.[0],
        targetNames: targetNamesError,
      });
      return;
    }

    const parsedInput = parseResult.data;

    onCreate({
      id: `c-${Date.now()}`,
      code: parsedInput.code.toUpperCase(),
      type: parsedInput.type,
      targetRole:
        parsedInput.type === "targeted" ? parsedInput.targetRole : undefined,
      targetNames:
        parsedInput.type === "targeted" ? parsedInput.targetNames : undefined,
      discount: parsedInput.discount,
      status: "active" as CouponStatus,
      validTill: parsedInput.validTill,
    });
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      title="Create Coupon"
      onClose={onClose}
      mode="workspace"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreateDisabled}>
            Create Coupon
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-textPrimary">
            Coupon Details
          </p>
          <Input
            id="coupon-code"
            label="Coupon Code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              if (errors.code) {
                setErrors((prev) => ({ ...prev, code: undefined }));
              }
            }}
            placeholder="SUMMER20"
            helperText="Use an easy-to-remember code, e.g. FESTIVE10"
            error={errors.code}
          />
          <Select
            id="coupon-type"
            label="Type"
            options={[
              { label: "Global", value: "global" },
              { label: "Targeted", value: "targeted" },
            ]}
            value={type}
            onChange={(event) =>
              handleTypeChange(event.target.value as CouponType)
            }
          />
          <Input
            id="coupon-discount"
            label="Discount"
            value={discount}
            onChange={(event) => {
              setDiscount(event.target.value);
              if (errors.discount) {
                setErrors((prev) => ({ ...prev, discount: undefined }));
              }
            }}
            placeholder="10% or $20"
            error={errors.discount}
          />
          <Input
            id="coupon-valid-till"
            type="date"
            label="Valid Till"
            value={validTill}
            onChange={(event) => {
              setValidTill(event.target.value);
              if (errors.validTill) {
                setErrors((prev) => ({ ...prev, validTill: undefined }));
              }
            }}
            error={errors.validTill}
          />
        </div>

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
                onChange={(event) => handleRoleChange(event.target.value)}
              />

              <div className="space-y-2">
                <p className="block text-sm font-medium text-textPrimary">
                  Select{" "}
                  {targetRole === "salesperson"
                    ? "Salespersons"
                    : "Distributors"}
                </p>
                <Input
                  id="coupon-target-search"
                  label="Search"
                  placeholder={`Search ${
                    targetRole === "salesperson"
                      ? "salespersons"
                      : "distributors"
                  }`}
                  value={targetSearch}
                  onChange={(event) => setTargetSearch(event.target.value)}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-textSecondary">
                    {targetNames.length} selected
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectVisible}
                      className="text-xs font-semibold text-accent transition hover:brightness-90"
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelected}
                      className="text-xs font-semibold text-textSecondary transition hover:text-textPrimary"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                  {filteredRoleOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-textSecondary">
                      No matching names found.
                    </p>
                  ) : (
                    filteredRoleOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-textPrimary hover:bg-page"
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
              Global coupons apply to all eligible users.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
