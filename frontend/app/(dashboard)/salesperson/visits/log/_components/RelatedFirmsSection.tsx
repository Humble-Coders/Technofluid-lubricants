// File: frontend/app/(dashboard)/salesperson/visits/log/_components/RelatedFirmsSection.tsx
"use client";

import { useCallback, useRef, useState } from "react";

import type { Product } from "@/types/product";
import type { PriorityItem, RelatedFirm } from "@/types/visit";
import { Input } from "@/components/ui/input";
import { PriorityList } from "@/components/ui/PriorityList";

type FirmErrors = {
  name?: string;
  monthly?: string;
  annually?: string;
};

type RelatedFirmsSectionProps = {
  products: Product[];
  onChange: (firms: RelatedFirm[]) => void;
  errors?: Record<number, FirmErrors>;
};

type InternalFirm = {
  _key: string;
  name: string;
  monthly: PriorityItem[];
  annually: PriorityItem[];
};

function makeEmptyFirm(): InternalFirm {
  return {
    _key: crypto.randomUUID(),
    name: "",
    monthly: [],
    annually: [],
  };
}

function toExternal(firm: InternalFirm): RelatedFirm {
  return {
    name: firm.name,
    priorities: { monthly: firm.monthly, annually: firm.annually },
  };
}

export function RelatedFirmsSection({
  products,
  onChange,
  errors = {},
}: RelatedFirmsSectionProps) {
  const [firms, setFirms] = useState<InternalFirm[]>([]);
  const firmsRef = useRef(firms);
  firmsRef.current = firms;

  const notify = useCallback(
    (next: InternalFirm[]) => onChange(next.map(toExternal)),
    [onChange],
  );

  const addFirm = () => {
    const next = [...firmsRef.current, makeEmptyFirm()];
    setFirms(next);
    notify(next);
  };

  const removeFirm = (index: number) => {
    const next = firmsRef.current.filter((_, i) => i !== index);
    setFirms(next);
    notify(next);
  };

  const updateName = (index: number, name: string) => {
    const next = firmsRef.current.map((f, i) =>
      i === index ? { ...f, name } : f,
    );
    setFirms(next);
    notify(next);
  };

  const updateMonthly = useCallback(
    (index: number, items: PriorityItem[]) => {
      const next = firmsRef.current.map((f, i) =>
        i === index ? { ...f, monthly: items } : f,
      );
      setFirms(next);
      notify(next);
    },
    [notify],
  );

  const updateAnnually = useCallback(
    (index: number, items: PriorityItem[]) => {
      const next = firmsRef.current.map((f, i) =>
        i === index ? { ...f, annually: items } : f,
      );
      setFirms(next);
      notify(next);
    },
    [notify],
  );

  return (
    <div className="space-y-3">
      {/* Empty state */}
      {firms.length === 0 ? (
        <button
          type="button"
          onClick={addFirm}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-page py-5 text-sm text-textSecondary transition hover:border-accent/50 hover:bg-surface hover:text-textPrimary"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add a related firm
        </button>
      ) : (
        <div className="space-y-3">
          {firms.map((firm, index) => (
            <FirmCard
              key={firm._key}
              firm={firm}
              index={index}
              products={products}
              errors={errors[index]}
              onNameChange={(name) => updateName(index, name)}
              onMonthlyChange={updateMonthly}
              onAnnuallyChange={updateAnnually}
              onRemove={() => removeFirm(index)}
            />
          ))}
        </div>
      )}

      {firms.length > 0 && (
        <button
          type="button"
          onClick={addFirm}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition hover:underline"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add another firm
        </button>
      )}
    </div>
  );
}

// ─── FirmCard ─────────────────────────────────────────────────────────────────

type FirmCardProps = {
  firm: InternalFirm;
  index: number;
  products: Product[];
  errors?: FirmErrors;
  onNameChange: (name: string) => void;
  onMonthlyChange: (index: number, items: PriorityItem[]) => void;
  onAnnuallyChange: (index: number, items: PriorityItem[]) => void;
  onRemove: () => void;
};

function FirmCard({
  firm,
  index,
  products,
  errors,
  onNameChange,
  onMonthlyChange,
  onAnnuallyChange,
  onRemove,
}: FirmCardProps) {
  const handleMonthly = useCallback(
    (items: PriorityItem[]) => onMonthlyChange(index, items),
    [index, onMonthlyChange],
  );

  const handleAnnually = useCallback(
    (items: PriorityItem[]) => onAnnuallyChange(index, items),
    [index, onAnnuallyChange],
  );

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-page p-4">
      {/* Firm name header */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            id={`firm-name-${firm._key}`}
            label={`Firm ${index + 1}`}
            placeholder="Enter firm name"
            value={firm.name}
            onChange={(e) => onNameChange(e.target.value)}
            error={errors?.name}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-7 shrink-0 rounded-lg p-2 text-danger/60 transition hover:bg-danger/10 hover:text-danger"
          aria-label={`Remove firm ${index + 1}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Monthly priorities */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-textSecondary">
          Monthly Priorities
          <span className="ml-1 font-normal normal-case text-danger">
            (required)
          </span>
        </p>
        <PriorityList
          products={products}
          onChange={handleMonthly}
          minItems={5}
          required
          error={errors?.monthly}
        />
      </div>

      {/* Annual priorities */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-textSecondary">
          Annual Priorities
          <span className="ml-1 font-normal normal-case text-textSecondary">
            (optional)
          </span>
        </p>
        <PriorityList
          products={products}
          onChange={handleAnnually}
          minItems={5}
          required={false}
          error={errors?.annually}
        />
      </div>
    </div>
  );
}
