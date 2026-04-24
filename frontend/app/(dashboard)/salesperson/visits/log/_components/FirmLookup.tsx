"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getFirmByGst,
  getBranchByGstAndAddress,
  getAutoFillPriorities,
} from "@/lib/services/firmService";
import { isValidGstFormat } from "@/lib/services/gstVerificationService";
import { useGstVerification } from "@/lib/hooks/useGstVerification";
import type { PrioritySet } from "@/types/visit";

type FirmLookupProps = {
  gstNumber: string;
  firmName: string;
  address: string;
  location: { lat: number; lng: number } | null;
  onGstChange: (gst: string) => void;
  onNameChange: (name: string) => void;
  onAddressChange: (address: string) => void;
  onPrioritiesLoaded?: (priorities: PrioritySet) => void;
  onPrioritiesReset?: () => void;
  error?: string;
  addressError?: string;
};

export function FirmLookup({
  gstNumber,
  firmName,
  address,
  onGstChange,
  onNameChange,
  onAddressChange,
  onPrioritiesLoaded,
  onPrioritiesReset,
  error,
  addressError,
}: FirmLookupProps) {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [showAddNewAddress, setShowAddNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [isLoadingBranch, setIsLoadingBranch] = useState(false);

  const { state: gstState, verify, reset: resetGst } = useGstVerification();
  const isLoading = gstState.status === "loading";

  // ─── Debounce: auto-verify once input reaches 15 chars ──────────────────────

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = gstNumber.trim().toUpperCase();
    if (trimmed.length !== 15 || !isValidGstFormat(trimmed)) return;

    debounceRef.current = setTimeout(() => {
      handleVerify(trimmed);
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstNumber]);

  // ─── Load address history when GST is already set ────────────────────────────

  useEffect(() => {
    if (gstNumber.trim()) loadAddressesForGst(gstNumber.trim());
    else setAddresses([]);
  }, [gstNumber]);

  // ─── Sync name from successful verification ──────────────────────────────────

  useEffect(() => {
    if (gstState.status === "success" && gstState.data) {
      const { legalName, tradeName } = gstState.data;
      onNameChange(tradeName || legalName);
    }
  }, [gstState.status]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function loadAddressesForGst(gst: string) {
    try {
      const firm = await getFirmByGst(gst);
      if (!firm?.history) return;

      const seen = new Set<string>(address ? [address.trim()] : []);
      firm.history.forEach((h) => {
        if (h.address?.trim()) seen.add(h.address.trim());
      });
      setAddresses(Array.from(seen));
    } catch {
      setAddresses([]);
    }
  }

  async function handleVerify(gst: string) {
    resetGst();
    const data = await verify(gst);
    if (data) {
      onNameChange(data.tradeName || data.legalName);
      await loadAddressesForGst(gst);
    }
  }

  const handleAddressSelect = (addr: string) => {
    onAddressChange(addr);
    setShowAddNewAddress(false);
    setNewAddress("");
    checkBranchAndLoadPriorities(addr);
  };

  const handleAddNewAddress = () => {
    if (!newAddress.trim()) return;
    const trimmed = newAddress.trim();
    setAddresses((prev) =>
      prev.includes(trimmed) ? prev : [trimmed, ...prev]
    );
    onAddressChange(trimmed);
    setShowAddNewAddress(false);
    setNewAddress("");
  };

  async function checkBranchAndLoadPriorities(addr: string) {
    if (!gstNumber.trim() || !addr.trim()) return;

    setIsLoadingBranch(true);
    try {
      const exists = await getBranchByGstAndAddress(gstNumber.trim(), addr);
      if (exists) {
        setShowBranchDialog(true);
      } else {
        const priorities = await getAutoFillPriorities(gstNumber.trim(), addr);
        if (priorities && onPrioritiesLoaded) onPrioritiesLoaded(priorities);
      }
    } catch {
      // non-fatal: user can still fill priorities manually
    } finally {
      setIsLoadingBranch(false);
    }
  }

  const handleSameBranch = async () => {
    const priorities = await getAutoFillPriorities(gstNumber.trim(), address);
    if (priorities && onPrioritiesLoaded) {
      onPrioritiesLoaded(priorities);
      onPrioritiesReset?.();
    }
    setShowBranchDialog(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const gstStatusColor =
    gstState.data?.status?.toLowerCase() === "active"
      ? "text-success"
      : "text-warning";

  return (
    <div className="space-y-3">
      {/* GST Input */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id="gst-number"
            label="GST Number"
            placeholder="e.g. 22AAAAA0000A1Z5"
            value={gstNumber}
            onChange={(e) => {
              onGstChange(e.target.value);
              if (gstState.status !== "idle") resetGst();
            }}
            onBlur={() => {
              const trimmed = gstNumber.trim().toUpperCase();
              if (trimmed && isValidGstFormat(trimmed)) handleVerify(trimmed);
            }}
            error={
              gstState.status === "error" ? (gstState.error ?? undefined) : error
            }
          />
        </div>
        <Button
          type="button"
          onClick={() => handleVerify(gstNumber.trim().toUpperCase())}
          isLoading={isLoading}
          disabled={!gstNumber.trim() || !isValidGstFormat(gstNumber)}
          className="shrink-0 mt-7"
        >
          Verify
        </Button>
      </div>

      {/* Firm name + status badge */}
      {firmName && (
        <div className="rounded-lg border border-border bg-page px-3 py-2">
          <p className="text-xs font-medium text-textSecondary">Firm Name</p>
          <p className="text-sm text-textPrimary">{firmName}</p>
          {gstState.data?.status && (
            <p className={`mt-0.5 text-xs font-semibold ${gstStatusColor}`}>
              {gstState.data.status}
              {gstState.data.registrationDate
                ? ` · Registered ${gstState.data.registrationDate}`
                : ""}
            </p>
          )}
        </div>
      )}

      {/* Address picker */}
      {gstNumber && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-textPrimary">
            Address <span className="text-danger">*</span>
          </label>

          {!showAddNewAddress ? (
            <select
              value={address}
              onChange={(e) =>
                e.target.value === "add-new"
                  ? setShowAddNewAddress(true)
                  : handleAddressSelect(e.target.value)
              }
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20"
            >
              <option value="">Select address</option>
              {addresses.map((addr) => (
                <option key={addr} value={addr}>
                  {addr}
                </option>
              ))}
              <option value="add-new">+ Add New</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <Input
                id="new-address"
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
          )}

          {addressError && (
            <p className="text-sm text-danger">{addressError}</p>
          )}
        </div>
      )}

      {/* Branch dialog */}
      {showBranchDialog && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
          <p className="text-sm font-medium text-textPrimary">
            This location already exists for this firm.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSameBranch}
              isLoading={isLoadingBranch}
              className="flex-1"
            >
              Same Branch
            </Button>
            <Button
              type="button"
              onClick={() => setShowBranchDialog(false)}
              className="flex-1"
            >
              New Branch
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
