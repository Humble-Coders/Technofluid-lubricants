"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Product } from "@/types/product";
import type { PriorityItem } from "@/types/visit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PriorityList } from "@/components/ui/PriorityList";
import { lookupGstNumber } from "@/lib/services/gstService";
import { getFirmByGst, getAutoFillPriorities, type Firm } from "@/lib/services/firmService";

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
  onPrioritiesChange: (index: number, monthly: PriorityItem[], annually: PriorityItem[]) => void;
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
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);
  const [showAddNewAddress, setShowAddNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [firmDataCache, setFirmDataCache] = useState<Firm | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const autoFilledGstRef = useRef<string>("");

  const handleMonthly = useCallback(
    (items: PriorityItem[]) => onMonthlyChange(index, items),
    [index, onMonthlyChange],
  );

  const handleAnnually = useCallback(
    (items: PriorityItem[]) => onAnnuallyChange(index, items),
    [index, onAnnuallyChange],
  );

  useEffect(() => {
    if (!firm.hasGst || !firm.gstNumber.trim()) {
      setAddresses([]);
      setFirmDataCache(null);
      autoFilledGstRef.current = "";
      return;
    }

    if (autoFilledGstRef.current === firm.gstNumber.trim()) {
      return;
    }

    let cancelled = false;

    const autoFill = async () => {
      try {
        const firmData = await getFirmByGst(firm.gstNumber.trim());

        if (cancelled) return;

        if (firmData?.history && firmData.history.length > 0) {
          autoFilledGstRef.current = firm.gstNumber.trim();
          setFirmDataCache(firmData);

          const addressSet = new Set<string>();
          firmData.history.forEach((h) => {
            if (h.address?.trim()) {
              addressSet.add(h.address.trim());
            }
          });
          setAddresses(Array.from(addressSet));

          // Don't auto-select address - let user manually select from dropdown
        } else {
          setAddresses([]);
          setFirmDataCache(null);
        }
      } catch (err) {
        console.error("Error auto-filling firm data:", err);
        setAddresses([]);
        setFirmDataCache(null);
      }
    };

    autoFill();

    return () => {
      cancelled = true;
    };
  }, [firm.gstNumber, firm.hasGst]);

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

  const handleLookupGst = async () => {
    if (!firm.gstNumber.trim()) return;

    setIsLoadingLookup(true);
    try {
      const mockResult = await lookupGstNumber(firm.gstNumber.trim());
      if (mockResult) {
        onNameChange(mockResult.firmName);
      } else {
        const firmData = await getFirmByGst(firm.gstNumber.trim());
        if (firmData) {
          onNameChange(firmData.currentName);
        }
      }
    } catch (err) {
      console.error("Error fetching GST details:", err);
    } finally {
      setIsLoadingLookup(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-page p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-textPrimary">
            Firm {index + 1} - GST Number
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <span className="text-sm font-medium text-textSecondary">
              No GST
            </span>
            <div
              className="relative inline-flex h-5 w-9 items-center rounded-full bg-border transition-colors"
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
            Address ({addresses.length} available)
          </label>
          {addresses.length > 0 ? (
            !showAddNewAddress ? (
              <div className="flex gap-2">
                <select
                  value={selectedAddress}
                  onChange={(e) => {
                    const selectedValue = e.target.value;
                    setSelectedAddress(selectedValue); // Update local state immediately
                    if (selectedValue === "add-new") {
                      setShowAddNewAddress(true);
                    } else if (selectedValue?.trim()) {
                      handleAddressSelect(selectedValue);
                    }
                  }}
                  className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20"
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
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  id={`new-address-${firm._key}`}
                  label=""
                  placeholder="Enter new address"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={handleAddNewAddress}
                  className="shrink-0 mt-7"
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddNewAddress(false)}
                  className="shrink-0 mt-7"
                >
                  Cancel
                </Button>
              </div>
            )
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
