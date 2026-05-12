"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { FirmLookup } from "./FirmLookup";
import { FormSection } from "./FormSection";
import { useGstApiSettings } from "@/lib/hooks/useGstApiSettings";
import type { FormErrors } from "../_hooks/useLogVisitValidation";
import type { PriorityItem } from "@/types/visit";
import { getAllFirms, type Firm } from "@/lib/services/firmService";

type VisitDetailsSectionProps = {
  hasGst: boolean;
  onHasGstChange: (value: boolean) => void;
  gstNumber: string;
  onGstNumberChange: (value: string) => void;
  firmName: string;
  onFirmNameChange: (value: string) => void;
  address: string;
  onAddressChange: (value: string) => void;
  location: { lat: number; lng: number } | null;
  errors: FormErrors;
  onPrioritiesLoaded: (priorities: {
    monthly: PriorityItem[];
    annually: PriorityItem[];
  }) => void;
  onPrioritiesReset: () => void;
};

export function VisitDetailsSection({
  hasGst,
  onHasGstChange,
  gstNumber,
  onGstNumberChange,
  firmName,
  onFirmNameChange,
  address,
  onAddressChange,
  location,
  errors,
  onPrioritiesLoaded,
  onPrioritiesReset,
}: VisitDetailsSectionProps) {
  const { settings: gstApiSettings } = useGstApiSettings();
  const apiEnabled = gstApiSettings.enabled;

  const [allFirms, setAllFirms] = useState<Firm[]>([]);
  const [firmsLoaded, setFirmsLoaded] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<Firm[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const justSelectedRef = useRef(false);

  const handleNameFocus = async () => {
    if (apiEnabled || firmsLoaded) return;
    setFirmsLoaded(true);
    try {
      const firms = await getAllFirms();
      setAllFirms(firms);
    } catch {
      // best-effort
    }
  };

  useEffect(() => {
    if (apiEnabled) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    const q = firmName.trim().toLowerCase();
    if (!q || allFirms.length === 0) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
      return;
    }
    const matches = allFirms
      .filter((f) =>
        (f.tradeName || f.legalName || f.currentName || "")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
    setNameSuggestions(matches);
    setShowNameSuggestions(matches.length > 0);
  }, [firmName, allFirms, apiEnabled]);

  const handleNameSuggestionSelect = (f: Firm) => {
    justSelectedRef.current = true;
    onFirmNameChange(f.tradeName || f.legalName || f.currentName || "");
    if (f.currentAddress) onAddressChange(f.currentAddress);
    if (f.defaultPriorities) {
      onPrioritiesLoaded({
        monthly: f.defaultPriorities.monthly ?? [],
        annually: f.defaultPriorities.annually ?? [],
      });
      onPrioritiesReset();
    }
    setShowNameSuggestions(false);
  };

  // Show manual name+address when API is off OR when user toggled No GST
  const showManualFields = !apiEnabled || !hasGst;

  return (
    <FormSection step={1} title="Visit Details">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {/* Toggle only shown when API is on */}
            {apiEnabled && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <span className="text-sm font-medium text-textSecondary">
                  No GST
                </span>
                <div
                  className="relative inline-flex h-5 w-9 items-center rounded-full bg-border transition-colors"
                  style={{
                    backgroundColor: !hasGst
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                  }}
                >
                  <div
                    className="absolute h-4 w-4 rounded-full bg-white transition-transform"
                    style={{
                      transform: !hasGst ? "translateX(17px)" : "translateX(2px)",
                    }}
                  />
                  <input
                    type="checkbox"
                    checked={!hasGst}
                    onChange={(e) => onHasGstChange(!e.target.checked)}
                    className="sr-only"
                  />
                </div>
              </label>
            )}
          </div>

          {showManualFields ? (
            <>
              <div className="relative">
                <Input
                  id="firm-name-manual"
                  label="Name"
                  placeholder="Enter the firm name"
                  value={firmName}
                  onChange={(e) => onFirmNameChange(e.target.value)}
                  onFocus={handleNameFocus}
                  onBlur={() =>
                    setTimeout(() => setShowNameSuggestions(false), 150)
                  }
                  error={errors.firmName}
                />
                {showNameSuggestions && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg">
                    {nameSuggestions.map((f) => {
                      const displayName =
                        f.tradeName || f.legalName || f.currentName || "";
                      return (
                        <button
                          key={f.gstNumber}
                          type="button"
                          onMouseDown={() => handleNameSuggestionSelect(f)}
                          className="w-full px-4 py-2.5 text-left text-sm text-textPrimary hover:bg-accent/10 first:rounded-t-xl last:rounded-b-xl"
                        >
                          <div className="font-medium">{displayName}</div>
                          {f.currentAddress && (
                            <div className="truncate text-xs text-textSecondary">
                              {f.currentAddress}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <Input
                id="address"
                label="Address"
                placeholder="Enter the address"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
              />
            </>
          ) : (
            <FirmLookup
              gstNumber={gstNumber}
              firmName={firmName}
              address={address}
              location={location}
              onGstChange={onGstNumberChange}
              onNameChange={onFirmNameChange}
              onAddressChange={onAddressChange}
              onPrioritiesLoaded={onPrioritiesLoaded}
              onPrioritiesReset={onPrioritiesReset}
              error={errors.gstNumber}
              addressError={errors.address}
            />
          )}
        </div>
        <div className="rounded-xl border border-border bg-page px-4 py-3 text-sm text-textSecondary">
          Location is captured automatically when you take a photo or video.
        </div>
      </div>
    </FormSection>
  );
}
