"use client";

import { GstDistributorLookup } from "../../_components/GstDistributorLookup";
import { CreateFormSection } from "./CreateFormSection";

type DistributorIdentitySectionProps = {
  gstNumber: string;
  firmName: string;
  address: string;
  onGstChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onLinkedFirmIdChange: (id: string | null) => void;
  onAutoFillState?: (state: string) => void;
  onAutoFillCity?: (city: string) => void;
  errors: { gstNumber?: string; firmName?: string; address?: string };
  disabled?: boolean;
};

export function DistributorIdentitySection({
  gstNumber,
  firmName,
  address,
  onGstChange,
  onNameChange,
  onAddressChange,
  onLinkedFirmIdChange,
  onAutoFillState,
  onAutoFillCity,
  errors,
  disabled,
}: DistributorIdentitySectionProps) {
  return (
    <CreateFormSection step={1} title="Distributor Identity">
      <GstDistributorLookup
        gstNumber={gstNumber}
        firmName={firmName}
        address={address}
        onGstChange={onGstChange}
        onNameChange={onNameChange}
        onAddressChange={onAddressChange}
        onLinkedFirmIdChange={onLinkedFirmIdChange}
        onAutoFillState={onAutoFillState}
        onAutoFillCity={onAutoFillCity}
        autoFillAddress={false}
        gstError={errors.gstNumber}
        nameError={errors.firmName}
        addressError={errors.address}
        disabled={disabled}
      />
    </CreateFormSection>
  );
}
