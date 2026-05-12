"use client";

import { DISTRIBUTOR_TYPES } from "@/lib/constants";
import type { DistributorType } from "@/types/distributor";
import { CreateFormSection } from "./CreateFormSection";

const TYPE_META: Record<
  DistributorType,
  { label: string; description: string; icon: React.ReactNode }
> = {
  Automotive: {
    label: "Automotive",
    description: "Lubricants for vehicles, engines & transport",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <path d="M16 8h4l3 5v3h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  Industrial: {
    label: "Industrial",
    description: "Lubricants for machinery, equipment & manufacturing",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  Combined: {
    label: "Combined",
    description: "Both automotive and industrial distribution",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
};

type DistributorTypeSectionProps = {
  value: DistributorType | "";
  onChange: (type: DistributorType) => void;
  error?: string;
  disabled?: boolean;
};

export function DistributorTypeSection({
  value,
  onChange,
  error,
  disabled,
}: DistributorTypeSectionProps) {
  const types = Object.values(DISTRIBUTOR_TYPES) as DistributorType[];

  return (
    <CreateFormSection step={3} title="Distributor Type">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {types.map((type) => {
            const meta = TYPE_META[type];
            const isSelected = value === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => !disabled && onChange(type)}
                disabled={disabled}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? "border-accent bg-accent/10 ring-2 ring-accent/20"
                    : "border-border bg-page hover:border-accent/50 hover:bg-surface"
                }`}
              >
                <span
                  className={`${isSelected ? "text-accent" : "text-textSecondary"}`}
                >
                  {meta.icon}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    isSelected ? "text-accent" : "text-textPrimary"
                  }`}
                >
                  {meta.label}
                </span>
                <span className="text-xs text-textSecondary">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </CreateFormSection>
  );
}
