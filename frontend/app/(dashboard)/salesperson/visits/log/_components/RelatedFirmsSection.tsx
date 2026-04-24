// File: frontend/app/(dashboard)/salesperson/visits/log/_components/RelatedFirmsSection.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PriorityItem } from "@/types/visit";

import { RelatedFirmCard } from "./RelatedFirmCard";
import {
  makeEmptyFirm,
  toExternal,
  toInternal,
} from "./relatedFirms.transforms";
import type {
  InternalFirm,
  RelatedFirmsSectionProps,
} from "./relatedFirms.types";

export function RelatedFirmsSection({
  products,
  initialFirms = [],
  resetKey,
  onChange,
  errors = {},
}: RelatedFirmsSectionProps) {
  const [firms, setFirms] = useState<InternalFirm[]>(() =>
    toInternal(initialFirms),
  );
  const firmsRef = useRef(firms);
  firmsRef.current = firms;

  useEffect(() => {
    setFirms(toInternal(initialFirms));
  }, [resetKey]);

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

  const updateGstNumber = (index: number, gstNumber: string) => {
    const next = firmsRef.current.map((f, i) =>
      i === index ? { ...f, gstNumber } : f,
    );
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

  const updateAddress = (index: number, address: string) => {
    const next = firmsRef.current.map((f, i) =>
      i === index ? { ...f, address } : f,
    );
    setFirms(next);
    notify(next);
  };

  const updateHasGst = (index: number, hasGst: boolean) => {
    const next = firmsRef.current.map((f, i) =>
      i === index ? { ...f, hasGst } : f,
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

  const updatePriorities = useCallback(
    (index: number, monthly: PriorityItem[], annually: PriorityItem[]) => {
      const next = firmsRef.current.map((f, i) =>
        i === index ? { ...f, monthly, annually } : f,
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
            <RelatedFirmCard
              key={firm._key}
              firm={firm}
              index={index}
              products={products}
              errors={errors[index]}
              onGstNumberChange={(gstNumber) =>
                updateGstNumber(index, gstNumber)
              }
              onNameChange={(name) => updateName(index, name)}
              onAddressChange={(address) => updateAddress(index, address)}
              onHasGstChange={(hasGst) => updateHasGst(index, hasGst)}
              onMonthlyChange={updateMonthly}
              onAnnuallyChange={updateAnnually}
              onPrioritiesChange={updatePriorities}
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
