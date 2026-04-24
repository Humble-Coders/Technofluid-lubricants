import { Input } from "@/components/ui/input";
import { FirmLookup } from "./FirmLookup";
import { FormSection } from "./FormSection";
import type { FormErrors } from "../_hooks/useLogVisitValidation";
import type { PriorityItem } from "@/types/visit";

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
  return (
    <FormSection step={1} title="Visit Details">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
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
                  onChange={(e) => {
                    onHasGstChange(!e.target.checked);
                  }}
                  className="sr-only"
                />
              </div>
            </label>
          </div>
          {hasGst ? (
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
          ) : (
            <>
              <Input
                id="firm-name-manual"
                label="Name"
                placeholder="Enter the firm name"
                value={firmName}
                onChange={(e) => {
                  onFirmNameChange(e.target.value);
                }}
                error={errors.firmName}
              />
              <Input
                id="address"
                label="Address"
                placeholder="Enter the address"
                value={address}
                onChange={(e) => {
                  onAddressChange(e.target.value);
                }}
              />
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-page px-4 py-3 text-sm text-textSecondary">
          Location is captured automatically when you take a photo or video.
        </div>
      </div>
    </FormSection>
  );
}
