"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { lookupGstNumber } from "@/lib/services/gstService";
import {
  getFirmByGst,
  getBranchByGstAndLocation,
  getAutoFillPriorities,
  type Firm,
} from "@/lib/services/firmService";
import type { PrioritySet } from "@/types/visit";

// Mock GST list - will be fetched from DB in future
const AVAILABLE_GSTS = [
  "27ABCDE1234F1Z0",
  "18AABCD1234G1Z5",
  "29ABCDE1234H1Z9",
  "33ABCDE1234I1Z2",
  "24AABCD1234J1Z8",
];

type FirmLookupProps = {
  gstNumber: string;
  firmName: string;
  address: string;
  location: { lat: number; lng: number } | null;
  onGstChange: (gst: string) => void;
  onNameChange: (name: string) => void;
  onAddressChange: (address: string) => void;
  onPrioritiesLoaded?: (priorities: PrioritySet) => void;
  error?: string;
};

export function FirmLookup({
  gstNumber,
  firmName,
  address,
  location,
  onGstChange,
  onNameChange,
  onAddressChange,
  onPrioritiesLoaded,
  error,
}: FirmLookupProps) {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [showAddNewAddress, setShowAddNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [isLoadingBranch, setIsLoadingBranch] = useState(false);

  useEffect(() => {
    if (gstNumber.trim()) {
      loadAddressesForGst(gstNumber.trim());
    }
  }, [gstNumber]);

  const loadAddressesForGst = async (gst: string) => {
    if (!gst.trim()) {
      setAddresses([]);
      return;
    }

    try {
      const firm = await getFirmByGst(gst);
      if (firm?.history && Array.isArray(firm.history)) {
        const uniqueAddresses = Array.from(
          new Set(firm.history.map((h) => h.address).filter(Boolean)),
        );
        setAddresses(uniqueAddresses);
      } else {
        setAddresses([]);
      }
    } catch (err) {
      console.error("Error loading addresses:", err);
      setAddresses([]);
    }
  };

  const handleAddressSelect = (addr: string) => {
    onAddressChange(addr);
    setShowAddNewAddress(false);
    setNewAddress("");
    checkBranchAndLoadPriorities(addr);
  };

  const handleAddNewAddress = () => {
    if (newAddress.trim()) {
      onAddressChange(newAddress.trim());
      setShowAddNewAddress(false);
      setNewAddress("");
    }
  };

  const checkBranchAndLoadPriorities = async (addr?: string) => {
    if (!gstNumber.trim() || !location) return;

    setIsLoadingBranch(true);
    try {
      const exists = await getBranchByGstAndLocation(gstNumber.trim(), location);
      if (exists) {
        setShowBranchDialog(true);
      } else {
        const priorities = await getAutoFillPriorities(
          gstNumber.trim(),
          location,
        );
        if (priorities && onPrioritiesLoaded) {
          onPrioritiesLoaded(priorities);
        }
      }
    } catch (err) {
      console.error("Error checking branch:", err);
    } finally {
      setIsLoadingBranch(false);
    }
  };

  const handleSameBranch = async () => {
    const priorities = await getAutoFillPriorities(gstNumber.trim(), location!);
    if (priorities && onPrioritiesLoaded) {
      onPrioritiesLoaded(priorities);
    }
    setShowBranchDialog(false);
  };

  const handleNewBranch = () => {
    setShowBranchDialog(false);
  };

  return (
    <div className="space-y-3">
      {/* GST Textbox */}
      <Input
        id="gst-number"
        label="GST Number"
        placeholder="Enter GST number"
        value={gstNumber}
        onChange={(e) => {
          onGstChange(e.target.value);
        }}
        onBlur={async () => {
          if (gstNumber.trim()) {
            try {
              const result = await lookupGstNumber(gstNumber.trim());
              if (result) {
                onNameChange(result.firmName);
                onAddressChange("");
                await loadAddressesForGst(gstNumber.trim());
              }
            } catch (err) {
              console.error("Error fetching GST details:", err);
            }
          }
        }}
        error={error}
      />

      {/* Firm Name Display */}
      {firmName && (
        <div className="rounded-lg border border-border bg-page px-3 py-2">
          <p className="text-xs font-medium text-textSecondary">Firm Name</p>
          <p className="text-sm text-textPrimary">{firmName}</p>
        </div>
      )}

      {/* Address Dropdown */}
      {gstNumber && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-textPrimary">
            Address
          </label>
          {!showAddNewAddress ? (
            <div className="flex gap-2">
              <select
                value={address}
                onChange={(e) =>
                  e.target.value === "add-new"
                    ? setShowAddNewAddress(true)
                    : handleAddressSelect(e.target.value)
                }
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-textPrimary shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20"
              >
                <option value="">Select address</option>
                {addresses.map((addr) => (
                  <option key={addr} value={addr}>
                    {addr}
                  </option>
                ))}
                <option value="add-new">+ Add New</option>
              </select>
            </div>
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
        </div>
      )}

      {/* Branch Dialog */}
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
              onClick={handleNewBranch}
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
