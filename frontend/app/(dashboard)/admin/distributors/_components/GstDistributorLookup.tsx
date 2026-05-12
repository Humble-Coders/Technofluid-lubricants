"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getFirmByGst } from "@/lib/services/firmService";
import { getDistributorByGst } from "@/lib/services/distributorService";
import {
  isValidGstFormat,
  verifyGstNumber,
} from "@/lib/services/gstVerificationService";
import type { GstVerifiedData } from "@/types/gst";

type LookupStatus =
  | "idle"
  | "checking-internal"
  | "found-internal"
  | "fetching-external"
  | "found-external"
  | "not-found"
  | "error";

type MatchedFirm = {
  name: string;
  address?: string;
  state?: string;
  gstStatus?: string;
  registrationDate?: string;
  source: "internal" | "external";
  raw?: GstVerifiedData;
};

type GstDistributorLookupProps = {
  gstNumber: string;
  firmName: string;
  address: string;
  onGstChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onLinkedFirmIdChange?: (id: string | null) => void;
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
  onLinkedFirmIdChange,
  gstError,
  nameError,
  addressError,
  disabled,
}: GstDistributorLookupProps) {
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [matchedFirm, setMatchedFirm] = useState<MatchedFirm | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [firmLinked, setFirmLinked] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = gstNumber.trim().toUpperCase();

    if (trimmed.length !== 15 || !isValidGstFormat(trimmed)) {
      setStatus("idle");
      setMatchedFirm(null);
      setAddresses([]);
      setFirmLinked(false);
      setErrorMessage(null);
      return;
    }

    const reqId = ++reqIdRef.current;

    debounceRef.current = setTimeout(async () => {
      setStatus("checking-internal");
      setMatchedFirm(null);
      setFirmLinked(false);
      setErrorMessage(null);

      try {
        // ── 1. Check firms collection ───────────────────────────────────────
        const firm = await getFirmByGst(trimmed);
        if (reqId !== reqIdRef.current) return;

        if (firm) {
          const name = firm.tradeName || firm.legalName || firm.currentName || "";
          const seen = new Set<string>();
          if (firm.currentAddress?.trim()) seen.add(firm.currentAddress.trim());
          firm.history?.forEach((h) => {
            if (h.address?.trim()) seen.add(h.address.trim());
          });
          const addrs = Array.from(seen);
          setAddresses(addrs);

          setMatchedFirm({
            name,
            address: firm.currentAddress || addrs[0],
            state: firm.state,
            gstStatus: firm.gstStatus,
            registrationDate: firm.registrationDate,
            source: "internal",
          });
          setStatus("found-internal");
          return;
        }

        // ── 2. Check distributors collection ───────────────────────────────
        const distributor = await getDistributorByGst(trimmed);
        if (reqId !== reqIdRef.current) return;

        if (distributor) {
          setMatchedFirm({
            name: distributor.name,
            address: distributor.address,
            source: "internal",
          });
          if (distributor.address) setAddresses([distributor.address]);
          setStatus("found-internal");
          return;
        }

        // ── 3. External GST API ────────────────────────────────────────────
        setStatus("fetching-external");
        const verified = await verifyGstNumber(trimmed);
        if (reqId !== reqIdRef.current) return;

        setMatchedFirm({
          name: verified.tradeName || verified.legalName,
          address: verified.address,
          state: verified.state,
          gstStatus: verified.status,
          registrationDate: verified.registrationDate,
          source: "external",
          raw: verified,
        });
        setAddresses(verified.address ? [verified.address] : []);
        setStatus("found-external");
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        const msg =
          err instanceof Error ? err.message : "Lookup failed. Try again.";
        // "not-found" errors from the GST API → treat as not-found
        if (msg.toLowerCase().includes("not found")) {
          setStatus("not-found");
        } else {
          setStatus("error");
          setErrorMessage(msg);
        }
        setAddresses([]);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstNumber]);

  const handleUseFirm = () => {
    if (!matchedFirm) return;
    onNameChange(matchedFirm.name);
    if (matchedFirm.address) onAddressChange(matchedFirm.address);
    onLinkedFirmIdChange?.(gstNumber.trim().toUpperCase());
    setFirmLinked(true);
  };

  const isLoading =
    status === "checking-internal" || status === "fetching-external";

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
          setStatus("idle");
          setMatchedFirm(null);
          setAddresses([]);
          setFirmLinked(false);
          onLinkedFirmIdChange?.(null);
        }}
        error={gstError}
        disabled={disabled}
      />

      {/* Loading states */}
      {status === "checking-internal" && (
        <p className="text-xs text-textSecondary animate-pulse">
          Checking database...
        </p>
      )}
      {status === "fetching-external" && (
        <p className="text-xs text-textSecondary animate-pulse">
          Not found locally — fetching from GST registry...
        </p>
      )}

      {/* Firm card — internal match */}
      {(status === "found-internal" || status === "found-external") &&
        matchedFirm && (
          <div
            className={`rounded-xl border px-4 py-3 space-y-2 ${
              status === "found-internal"
                ? "border-success/40 bg-success/5"
                : "border-accent/40 bg-accent/5"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {status === "found-internal" ? (
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
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 text-accent"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                  </svg>
                )}
                <span
                  className={`text-xs font-semibold ${
                    status === "found-internal"
                      ? "text-success"
                      : "text-accent"
                  }`}
                >
                  {status === "found-internal"
                    ? "Found in Database"
                    : "Verified via GST Registry"}
                </span>
              </div>

              {firmLinked ? (
                <span className="text-xs font-medium text-success shrink-0">
                  Linked
                </span>
              ) : (
                <Button
                  type="button"
                  onClick={handleUseFirm}
                  disabled={disabled}
                  className="h-7 shrink-0 px-3 text-xs"
                >
                  Use This Firm
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-textPrimary">
                {matchedFirm.name}
              </p>
              <p className="text-xs text-textSecondary font-mono">
                {gstNumber.trim().toUpperCase()}
              </p>
              {matchedFirm.address && (
                <p className="text-xs text-textSecondary">
                  {matchedFirm.address}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                {matchedFirm.state && (
                  <span className="text-xs text-textSecondary">
                    <span className="font-medium text-textPrimary">State:</span>{" "}
                    {matchedFirm.state}
                  </span>
                )}
                {matchedFirm.gstStatus && (
                  <span className="text-xs text-textSecondary">
                    <span className="font-medium text-textPrimary">Status:</span>{" "}
                    <span
                      className={
                        matchedFirm.gstStatus.toLowerCase() === "active"
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {matchedFirm.gstStatus}
                    </span>
                  </span>
                )}
                {matchedFirm.registrationDate && (
                  <span className="text-xs text-textSecondary">
                    <span className="font-medium text-textPrimary">
                      Registered:
                    </span>{" "}
                    {matchedFirm.registrationDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Not found */}
      {status === "not-found" && (
        <p className="text-xs text-textSecondary">
          GSTIN not found in registry — enter firm details manually below.
        </p>
      )}

      {/* Error */}
      {status === "error" && errorMessage && (
        <p className="text-xs text-danger">{errorMessage}</p>
      )}

      {/* Firm name */}
      <Input
        id="dist-firm-name"
        label="Firm Name"
        placeholder="Enter firm name"
        value={firmName}
        onChange={(e) => onNameChange(e.target.value)}
        error={nameError}
        disabled={disabled || isLoading}
      />

      {/* Address — dropdown if multiple, plain input otherwise */}
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
