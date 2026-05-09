"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { getFirmByGst } from "@/lib/services/firmService";
import { getDistributorByGst } from "@/lib/services/distributorService";
import { isValidGstFormat } from "@/lib/services/gstVerificationService";

type LookupStatus = "idle" | "loading" | "found" | "not-found";

type GstDistributorLookupProps = {
  gstNumber: string;
  firmName: string;
  address: string;
  onGstChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  gstError?: string;
  nameError?: string;
  addressError?: string;
  disabled?: boolean;
};

export function GstDistributorLookup({
  gstNumber,
  firmName,
  address,
  onGstChange,
  onNameChange,
  onAddressChange,
  gstError,
  nameError,
  addressError,
  disabled,
}: GstDistributorLookupProps) {
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const [addresses, setAddresses] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = gstNumber.trim().toUpperCase();
    if (trimmed.length !== 15 || !isValidGstFormat(trimmed)) {
      setLookupStatus("idle");
      setAddresses([]);
      return;
    }

    setLookupStatus("loading");

    debounceRef.current = setTimeout(async () => {
      try {
        // Try firms cache first, then fall back to distributors collection
        const firm = await getFirmByGst(trimmed);

        if (firm) {
          onNameChange(firm.tradeName || firm.currentName || "");

          const seen = new Set<string>();
          if (firm.currentAddress?.trim()) seen.add(firm.currentAddress.trim());
          firm.history?.forEach((h) => {
            if (h.address?.trim()) seen.add(h.address.trim());
          });

          const addrs = Array.from(seen);
          setAddresses(addrs);
          if (addrs.length === 1) onAddressChange(addrs[0]);
          else if (addrs.length === 0 && firm.currentAddress) onAddressChange(firm.currentAddress);

          setLookupStatus("found");
          return;
        }

        // Fallback: check distributors collection
        const distributor = await getDistributorByGst(trimmed);
        if (distributor) {
          onNameChange(distributor.name);
          if (distributor.address) {
            setAddresses([distributor.address]);
            onAddressChange(distributor.address);
          }
          setLookupStatus("found");
          return;
        }

        setLookupStatus("not-found");
        setAddresses([]);
      } catch {
        setLookupStatus("idle");
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstNumber]);

  return (
    <div className="space-y-3 md:col-span-2">
      {/* GSTIN input */}
      <Input
        id="dist-gst-number"
        label="GST Number"
        placeholder="e.g. 22AAAAA0000A1Z5"
        value={gstNumber}
        onChange={(e) => {
          onGstChange(e.target.value.toUpperCase());
          setLookupStatus("idle");
          setAddresses([]);
        }}
        error={gstError}
        disabled={disabled}
      />

      {/* Lookup status feedback */}
      {lookupStatus === "loading" && (
        <p className="text-xs text-textSecondary animate-pulse">
          Checking database...
        </p>
      )}
      {lookupStatus === "found" && (
        <p className="text-xs text-success">Firm found — details autofilled.</p>
      )}
      {lookupStatus === "not-found" && (
        <p className="text-xs text-textSecondary">
          Not in database — enter name manually.
        </p>
      )}

      {/* Firm name */}
      <Input
        id="dist-firm-name"
        label="Firm Name"
        placeholder="Enter firm name"
        value={firmName}
        onChange={(e) => onNameChange(e.target.value)}
        error={nameError}
        disabled={disabled}
      />

      {/* Address — dropdown if multiple locations, plain input otherwise */}
      {addresses.length > 1 ? (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-textPrimary">
            Address
          </label>
          <select
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select location</option>
            {addresses.map((addr) => (
              <option key={addr} value={addr}>
                {addr}
              </option>
            ))}
          </select>
          {addressError && (
            <p className="text-sm text-danger">{addressError}</p>
          )}
        </div>
      ) : (
        <Input
          id="dist-address"
          label="Address"
          placeholder="Enter address"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          error={addressError}
          disabled={disabled}
        />
      )}
    </div>
  );
}
