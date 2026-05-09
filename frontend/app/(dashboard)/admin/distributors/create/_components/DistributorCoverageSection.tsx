"use client";

import { useEffect, useRef, useState } from "react";
import { checkAreaCategoryConflict } from "@/lib/services/distributorService";
import { useServiceAreas } from "@/lib/useServiceAreas";
import { CreateFormSection } from "./CreateFormSection";
import { ServiceAreaCombobox } from "../../_components/ServiceAreaCombobox";

type DistributorCoverageSectionProps = {
  serviceArea: string;
  productCategories: string[];
  availableCategories: string[];
  onServiceAreaChange: (v: string) => void;
  onCategoriesChange: (categories: string[]) => void;
  onConflictChange: (conflicting: boolean) => void;
  errors: { serviceArea?: string; productCategories?: string };
  disabled?: boolean;
};

export function DistributorCoverageSection({
  serviceArea,
  productCategories,
  availableCategories,
  onServiceAreaChange,
  onCategoriesChange,
  onConflictChange,
  errors,
  disabled,
}: DistributorCoverageSectionProps) {
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingServiceAreas = useServiceAreas();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmedArea = serviceArea.trim();
    if (!trimmedArea || productCategories.length === 0) {
      setConflictWarning(null);
      onConflictChange(false);
      return;
    }

    setIsChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkAreaCategoryConflict(trimmedArea, productCategories);
        if (result.conflicting) {
          const msg = result.distributorName
            ? `"${result.distributorName}" already covers these categories in this area.`
            : "Another distributor already covers these categories in this area.";
          setConflictWarning(msg);
          onConflictChange(true);
        } else {
          setConflictWarning(null);
          onConflictChange(false);
        }
      } catch {
        setConflictWarning(null);
        onConflictChange(false);
      } finally {
        setIsChecking(false);
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceArea, productCategories]);

  const toggleCategory = (cat: string) => {
    const updated = productCategories.includes(cat)
      ? productCategories.filter((c) => c !== cat)
      : [...productCategories, cat];
    onCategoriesChange(updated);
  };

  return (
    <CreateFormSection step={3} title="Service Coverage">
      <div className="space-y-5">
        <ServiceAreaCombobox
          value={serviceArea}
          options={existingServiceAreas}
          onChange={onServiceAreaChange}
          error={errors.serviceArea}
          disabled={disabled}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-textPrimary">
            Product Categories{" "}
            <span className="text-danger">*</span>
          </label>
          {availableCategories.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableCategories.map((cat) => (
                <label
                  key={cat}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                    productCategories.includes(cat)
                      ? "border-accent bg-accent/10"
                      : "border-border bg-page hover:border-accent/50"
                  } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={productCategories.includes(cat)}
                    onChange={() => !disabled && toggleCategory(cat)}
                    disabled={disabled}
                    className="h-4 w-4 shrink-0 rounded border-border accent-[color:var(--color-accent)]"
                  />
                  <span className="text-sm text-textPrimary">{cat}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-textSecondary">
              No product categories found. Add products first.
            </p>
          )}
          {errors.productCategories && (
            <p className="text-sm text-danger">{errors.productCategories}</p>
          )}
        </div>

        {isChecking && (
          <p className="text-xs text-textSecondary animate-pulse">
            Checking for conflicts...
          </p>
        )}

        {conflictWarning && !isChecking && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-4 w-4 shrink-0 text-danger"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-sm text-danger">{conflictWarning}</p>
          </div>
        )}

        {!conflictWarning && !isChecking && serviceArea.trim() && productCategories.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-success"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-sm text-success">No conflicts — this coverage is available.</p>
          </div>
        )}
      </div>
    </CreateFormSection>
  );
}
