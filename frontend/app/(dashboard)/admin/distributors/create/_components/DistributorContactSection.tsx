"use client";

import { Input } from "@/components/ui/input";
import { CreateFormSection } from "./CreateFormSection";

type DistributorContactSectionProps = {
  phone: string;
  email: string;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  errors: { phone?: string; email?: string };
  disabled?: boolean;
};

export function DistributorContactSection({
  phone,
  email,
  onPhoneChange,
  onEmailChange,
  errors,
  disabled,
}: DistributorContactSectionProps) {
  return (
    <CreateFormSection step={2} title="Account Details">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="dist-phone"
          label="Phone"
          placeholder="+91 98765 43210"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          error={errors.phone}
          disabled={disabled}
        />
        <Input
          id="dist-email"
          type="email"
          label="Email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          error={errors.email}
          disabled={disabled}
        />
      </div>
      <p className="mt-3 text-xs text-textSecondary">
        A password-reset link will be sent to this email so the distributor can set their password.
      </p>
    </CreateFormSection>
  );
}
