"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Product } from "@/types/product";
import type { PriorityItem } from "@/types/visit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PriorityList } from "@/components/ui/PriorityList";
import {
  getFirmByGst,
  getAutoFillPriorities,
} from "@/lib/services/firmService";
import { isValidGstFormat } from "@/lib/services/gstVerificationService";
import { useGstVerification } from "@/lib/hooks/useGstVerification";
import { useGstApiSettings } from "@/lib/hooks/useGstApiSettings";

import type { FirmErrors, InternalFirm } from "./relatedFirms.types";

type RelatedFirmCardProps = {
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
  onPrioritiesChange: (
    index: number,
    monthly: PriorityItem[],
    annually: PriorityItem[],
  ) => void;
  onRemove: () => void;
};

export function RelatedFirmCard({
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
  onPrioritiesChange,
  onRemove,
}: RelatedFirmCardProps) {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [showAddNewAddress, setShowAddNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const autoFilledGstRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { settings: gstApiSettings } = useGstApiSettings();
  const { state: gstState, verify, reset: resetGst } = useGstVerification();
  const [manualFallback, setManualFallback] = useState(false);

  const handleMonthly = useCallback(
    (items: PriorityItem[]) => onMonthlyChange(index, items),
    [index, onMonthlyChange],
  );

  const handleAnnually = useCallback(
    (items: PriorityItem[]) => onAnnuallyChange(index, items),
    [index, onAnnuallyChange],
  );

  // Load address history from Firestore when GST changes
  useEffect(() => {
    if (!firm.hasGst || !firm.gstNumber.trim()) {
      setAddresses([]);
      autoFilledGstRef.current = "";
      return;
    }

    const gst = firm.gstNumber.trim();
    if (autoFilledGstRef.current === gst) return;

    let cancelled = false;

    getFirmByGst(gst)
      .then((firmData) => {
        if (cancelled) return;
        if (firmData?.history?.length) {
          autoFilledGstRef.current = gst;
          const seen = new Set<string>();
          firmData.history.forEach((h) => {
            if (h.address?.trim()) seen.add(h.address.trim());
          });
          setAddresses(Array.from(seen));
        } else {
          setAddresses([]);
        }
      })
      .catch(() => setAddresses([]));

    return () => {
      cancelled = true;
    };
  }, [firm.gstNumber, firm.hasGst]);

  // Debounce: auto-verify once a valid 15-char GST is typed
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!firm.hasGst) return;

    const trimmed = firm.gstNumber.trim().toUpperCase();
    if (trimmed.length !== 15 || !isValidGstFormat(trimmed)) return;

    debounceRef.current = setTimeout(() => handleVerify(trimmed), 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firm.gstNumber, firm.hasGst]);

  // Sync firm name from verified GST data
  useEffect(() => {
    if (gstState.status === "success" && gstState.data) {
      onNameChange(gstState.data.tradeName || gstState.data.legalName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstState.status]);

  // Sync local state with parent state
  useEffect(() => {
    if (firm.address) {
      setSelectedAddress(firm.address.trim());
    } else {
      setSelectedAddress("");
    }
  }, [firm.address]);

  const handleAddressSelect = async (addr: string) => {
    onAddressChange(addr);
    setShowAddNewAddress(false);
    setNewAddress("");

    if (firm.hasGst && firm.gstNumber.trim() && addr.trim()) {
      try {
        const priorities = await getAutoFillPriorities(
          firm.gstNumber.trim(),
          addr.trim(),
        );
        if (priorities) {
          onPrioritiesChange(index, priorities.monthly, priorities.annually);
        }
      } catch (err) {
        console.error("Error loading priorities for address:", err);
      }
    }
  };

  const handleAddNewAddress = () => {
    if (newAddress.trim()) {
      const trimmedAddress = newAddress.trim();
      if (!addresses.includes(trimmedAddress)) {
        setAddresses([trimmedAddress, ...addresses]);
      }
      onAddressChange(trimmedAddress);
      setShowAddNewAddress(false);
      setNewAddress("");
    }
  };

  async function handleVerify(gst: string) {
    resetGst();
    const data = await verify(gst);
    if (data) {
      onNameChange(data.tradeName || data.legalName);
      // refresh address list after successful verification
      autoFilledGstRef.current = "";
    }
  }

  const apiEnabled = gstApiSettings.enabled && !manualFallback;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-page p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-textPrimary">
            Firm {index + 1}
          </label>
          {/* Toggle only shown when API is on */}
          {apiEnabled && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <span className="text-sm font-medium text-textSecondary">
                No GST
              </span>
              <div
                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                style={{
                  backgroundColor: !firm.hasGst
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                }}
              >
                <div
                  className="absolute h-4 w-4 rounded-full bg-white transition-transform"
                  style={{
                    transform: !firm.hasGst
                      ? "translateX(17px)"
                      : "translateX(2px)",
                  }}
                />
                <input
                  type="checkbox"
                  checked={!firm.hasGst}
                  onChange={(e) => onHasGstChange(!e.target.checked)}
                  className="sr-only"
                />
              </div>
            </label>
          )}
        </div>

        {/* GST input — shown whenever hasGst; disabled when API is off */}
        {!manualFallback && firm.hasGst && (
          <div className="flex items-end gap-2">
            <Input
              id={`firm-gst-${firm._key}`}
              label="GST Number"
              placeholder="Enter GST number"
              value={firm.gstNumber}
              disabled={!apiEnabled}
              onChange={(e) => {
                onGstNumberChange(e.target.value);
                if (gstState.status !== "idle") resetGst();
              }}
              onBlur={() => {
                if (!apiEnabled) return;
                const trimmed = firm.gstNumber.trim().toUpperCase();
                if (trimmed && isValidGstFormat(trimmed)) handleVerify(trimmed);
              }}
              error={
                gstState.status === "error"
                  ? (gstState.error ?? undefined)
                  : errors?.gstNumber
              }
              className="h-10 flex-1"
            />

            {/* Verify button only when API is on */}
            {apiEnabled && (
              <Button
                type="button"
                onClick={() => handleVerify(firm.gstNumber.trim().toUpperCase())}
                isLoading={gstState.status === "loading"}
                disabled={
                  !firm.gstNumber.trim() || !isValidGstFormat(firm.gstNumber)
                }
                className="h-10 px-4 text-sm shrink-0"
              >
                Verify
              </Button>
            )}
          </div>
        )}

        {/* Fallback link when verification fails */}
        {apiEnabled && gstState.status === "error" && (
          <button
            type="button"
            onClick={() => setManualFallback(true)}
            className="text-xs text-accent underline underline-offset-2"
          >
            Can't verify right now? Enter details manually instead
          </button>
        )}

        {/* Try GST again after manual fallback */}
        {manualFallback && gstApiSettings.enabled && (
          <button
            type="button"
            onClick={() => { setManualFallback(false); resetGst(); }}
            className="text-xs text-accent underline underline-offset-2"
          >
            Try GST verification again
          </button>
        )}
      </div>

      {/* Verified firm name badge — only when API verified it */}
      {apiEnabled && firm.hasGst && firm.name && (
        <div className="rounded-lg border border-border bg-page px-3 py-2">
          <p className="text-xs font-medium text-textSecondary">Firm Name</p>
          <p className="text-sm text-textPrimary">{firm.name}</p>
        </div>
      )}

      {/* Address dropdown — only when API is on (pulls history by GST) */}
      {apiEnabled && firm.hasGst && firm.gstNumber && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-textPrimary">
            Address <span className="text-danger">*</span>
          </label>
          {!showAddNewAddress ? (
            <select
              value={selectedAddress}
              onChange={(e) => {
                const selectedValue = e.target.value;
                setSelectedAddress(selectedValue);
                if (selectedValue === "add-new") {
                  setShowAddNewAddress(true);
                } else if (selectedValue?.trim()) {
                  handleAddressSelect(selectedValue);
                }
              }}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20"
            >
              <option value="">Select address</option>
              {addresses.map((addr) => {
                const normalized = addr.trim();
                return (
                  <option key={normalized} value={normalized}>
                    {normalized}
                  </option>
                );
              })}
              <option value="add-new">+ Add New</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <Input
                id={`new-address-${firm._key}`}
                label=""
                placeholder="Enter new address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
              />
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  onClick={handleAddNewAddress}
                  className="h-9 px-3 text-sm shrink-0"
                >
                  Add
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddNewAddress(false)}
                  className="h-9 px-3 text-sm shrink-0"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual name + address: when no GST, API off, or manual fallback */}
      {(!firm.hasGst || !apiEnabled) && (
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

      <div className="h-px bg-border" />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-textSecondary">
          Monthly Priorities
          <span className="ml-1 font-normal normal-case text-danger">
            (required)
          </span>
        </p>
        <PriorityList
          key={`monthly-${selectedAddress}`}
          resetKey={`monthly-${selectedAddress}-${firm.monthly.length}`}
          products={products}
          initialItems={firm.monthly}
          onChange={handleMonthly}
          minItems={5}
          required
          error={errors?.monthly}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-textSecondary">
          Annual Priorities
          <span className="ml-1 font-normal normal-case text-textSecondary">
            (optional)
          </span>
        </p>
        <PriorityList
          key={`annual-${selectedAddress}`}
          resetKey={`annual-${selectedAddress}-${firm.annually.length}`}
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
