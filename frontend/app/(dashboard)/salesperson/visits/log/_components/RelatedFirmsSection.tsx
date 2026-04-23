// File: frontend/app/(dashboard)/salesperson/visits/log/_components/RelatedFirmsSection.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Product } from "@/types/product";
import type { PriorityItem, RelatedFirm } from "@/types/visit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PriorityList } from "@/components/ui/PriorityList";
import { lookupGstNumber } from "@/lib/services/gstService";
import { getFirmByGst } from "@/lib/services/firmService";
import type { PrioritySet } from "@/types/visit";

type FirmErrors = {
  gstNumber?: string;
  name?: string;
  monthly?: string;
  annually?: string;
};

type RelatedFirmsSectionProps = {
  products: Product[];
  initialFirms?: RelatedFirm[];
  resetKey?: string;
  onChange: (firms: RelatedFirm[]) => void;
  errors?: Record<number, FirmErrors>;
};

type InternalFirm = {
  _key: string;
  gstNumber: string;
  name: string;
  address: string;
  hasGst: boolean;
  monthly: PriorityItem[];
  annually: PriorityItem[];
};

function makeEmptyFirm(): InternalFirm {
  return {
    _key: crypto.randomUUID(),
    gstNumber: "",
    name: "",
    address: "",
    hasGst: true,
    monthly: [],
    annually: [],
  };
}

function toExternal(firm: InternalFirm): RelatedFirm {
  return {
    gstNumber: firm.hasGst ? firm.gstNumber : undefined,
    name: !firm.hasGst ? firm.name : undefined,
    address: firm.address || undefined,
    hasGst: firm.hasGst,
    priorities: { monthly: firm.monthly, annually: firm.annually },
  };
}

function toInternal(firms: RelatedFirm[] = []): InternalFirm[] {
  return firms.map((firm) => ({
    _key: crypto.randomUUID(),
    gstNumber: firm.gstNumber || "",
    name: firm.name || "",
    address: firm.address || "",
    hasGst: firm.hasGst ?? true,
    monthly: firm.priorities.monthly,
    annually: firm.priorities.annually,
  }));
}

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
              onGstNumberChange={(gstNumber) => updateGstNumber(index, gstNumber)}
              onNameChange={(name) => updateName(index, name)}
              onAddressChange={(address) => updateAddress(index, address)}
              onHasGstChange={(hasGst) => updateHasGst(index, hasGst)}
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
  onGstNumberChange: (gstNumber: string) => void;
  onNameChange: (name: string) => void;
  onAddressChange: (address: string) => void;
  onHasGstChange: (hasGst: boolean) => void;
  onMonthlyChange: (index: number, items: PriorityItem[]) => void;
  onAnnuallyChange: (index: number, items: PriorityItem[]) => void;
  onRemove: () => void;
};

function FirmCard({
  firm,
  index,
  products,
  errors,
  onGstNumberChange,
  onNameChange,
  onAddressChange,
  onHasGstChange,
  onMonthlyChange,
  onAnnuallyChange,
  onRemove,
}: FirmCardProps) {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);

  const handleMonthly = useCallback(
    (items: PriorityItem[]) => onMonthlyChange(index, items),
    [index, onMonthlyChange],
  );

  const handleAnnually = useCallback(
    (items: PriorityItem[]) => onAnnuallyChange(index, items),
    [index, onAnnuallyChange],
  );

  const loadAddressesForGst = useCallback(
    async (gst: string) => {
      if (!gst.trim()) {
        setAddresses([]);
        return;
      }

      try {
        const addressSet = new Set<string>();

        // Add current address if set
        if (firm.address?.trim()) {
          addressSet.add(firm.address.trim());
        }

        // Add addresses from firm history
        const firmData = await getFirmByGst(gst);
        if (firmData?.history && Array.isArray(firmData.history)) {
          firmData.history.forEach((h) => {
            if (h.address?.trim()) {
              addressSet.add(h.address.trim());
            }
          });
        }

        setAddresses(Array.from(addressSet));
      } catch (err) {
        console.error("Error loading addresses:", err);
        setAddresses([]);
      }
    },
    [firm.address],
  );

  const loadPrioritiesForAddress = async (address: string) => {
    if (!firm.gstNumber.trim() || !address.trim()) return;

    try {
      const firmData = await getFirmByGst(firm.gstNumber.trim());
      if (firmData?.history) {
        const matchingEntry = firmData.history.find(
          (h) => h.address.trim().toLowerCase() === address.trim().toLowerCase(),
        );
        if (matchingEntry && matchingEntry.priorities) {
          onMonthlyChange(index, matchingEntry.priorities.monthly);
          onAnnuallyChange(index, matchingEntry.priorities.annually);
        }
      }
    } catch (err) {
      console.error("Error loading priorities:", err);
    }
  };

  const handleLookupGst = async () => {
    if (!firm.gstNumber.trim()) return;

    setIsLoadingLookup(true);
    try {
      // Try mock data first
      const mockResult = await lookupGstNumber(firm.gstNumber.trim());
      if (mockResult) {
        onNameChange(mockResult.firmName);
      } else {
        // Fall back to Firestore
        const firmData = await getFirmByGst(firm.gstNumber.trim());
        if (firmData) {
          onNameChange(firmData.currentName);
        }
      }

      // Get addresses from Firestore
      await loadAddressesForGst(firm.gstNumber.trim());
    } catch (err) {
      console.error("Error fetching GST details:", err);
    } finally {
      setIsLoadingLookup(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-page p-4">
      {/* Firm GST and Name */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-textPrimary">
            Firm {index + 1} - GST Number
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <span className="text-sm font-medium text-textSecondary">
              No GST
            </span>
            <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-border transition-colors"
              style={{
                backgroundColor: !firm.hasGst ? "var(--color-accent)" : "var(--color-border)"
              }}>
              <div className="absolute h-4 w-4 rounded-full bg-white transition-transform"
                style={{
                  transform: !firm.hasGst ? "translateX(17px)" : "translateX(2px)"
                }} />
              <input
                type="checkbox"
                checked={!firm.hasGst}
                onChange={(e) => onHasGstChange(!e.target.checked)}
                className="sr-only"
              />
            </div>
          </label>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              id={`firm-gst-${firm._key}`}
              label=""
              placeholder="Enter GST number"
              value={firm.gstNumber}
              disabled={!firm.hasGst}
              onChange={(e) => onGstNumberChange(e.target.value)}
              onBlur={async () => {
                if (firm.hasGst && firm.gstNumber.trim()) {
                  await handleLookupGst();
                }
              }}
              error={errors?.gstNumber}
            />
          </div>
          <Button
            type="button"
            onClick={handleLookupGst}
            isLoading={isLoadingLookup}
            disabled={!firm.hasGst || !firm.gstNumber.trim()}
            className="shrink-0 mt-7"
          >
            Lookup
          </Button>
        </div>
      </div>

      {firm.hasGst && firm.name && (
        <div className="rounded-lg border border-border bg-page px-3 py-2">
          <p className="text-xs font-medium text-textSecondary">Firm Name</p>
          <p className="text-sm text-textPrimary">{firm.name}</p>
        </div>
      )}

      {firm.hasGst && firm.gstNumber && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-textPrimary">
            Address
          </label>
          {addresses.length > 0 ? (
            <select
              value={firm.address}
              onChange={(e) => {
                onAddressChange(e.target.value);
                if (e.target.value) {
                  loadPrioritiesForAddress(e.target.value);
                }
              }}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20"
            >
              <option value="">Select address</option>
              {addresses.map((addr) => (
                <option key={addr} value={addr}>
                  {addr}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={`firm-address-${firm._key}`}
              label=""
              placeholder="Enter the address"
              value={firm.address}
              onChange={(e) => onAddressChange(e.target.value)}
            />
          )}
        </div>
      )}

      {!firm.hasGst && (
        <>
          <Input
            id={`firm-name-${firm._key}`}
            label="Name"
            placeholder="Enter the firm name"
            value={firm.name}
            onChange={(e) => onNameChange(e.target.value)}
            error={errors?.name}
          />
          <Input
            id={`firm-address-${firm._key}`}
            label="Address"
            placeholder="Enter the address"
            value={firm.address}
            onChange={(e) => onAddressChange(e.target.value)}
          />
        </>
      )}

      {firm.hasGst && !addresses.length && (
        <Input
          id={`firm-address-${firm._key}`}
          label="Address"
          placeholder="Enter the address"
          value={firm.address}
          onChange={(e) => onAddressChange(e.target.value)}
        />
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg p-2 text-danger/60 transition hover:bg-danger/10 hover:text-danger"
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
          initialItems={firm.monthly}
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
          initialItems={firm.annually}
          onChange={handleAnnually}
          minItems={5}
          required={false}
          error={errors?.annually}
        />
      </div>
    </div>
  );
}
