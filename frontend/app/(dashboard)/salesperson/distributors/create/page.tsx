// File: frontend/app/(dashboard)/salesperson/distributors/create/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useProducts } from "@/lib/useProducts";
import { useAuth } from "@/lib/useAuth";
import { createDistributorInFirestore } from "@/lib/services/distributorService";
import { ALL_STATES } from "@/lib/data/territories";
import type { AssignedProduct, DistributorType, Territory } from "@/types/distributor";
import { DistributorIdentitySection } from "../../../admin/distributors/create/_components/DistributorIdentitySection";
import { DistributorContactSection } from "../../../admin/distributors/create/_components/DistributorContactSection";
import { DistributorTypeSection } from "../../../admin/distributors/create/_components/DistributorTypeSection";
import { DistributorCoverageSection } from "../../../admin/distributors/create/_components/DistributorCoverageSection";

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

type FormErrors = {
  firmName?: string;
  phone?: string;
  email?: string;
  distributorType?: string;
  territory?: string;
  assignedProducts?: string;
};

const EMPTY_TERRITORY: Territory = { states: [], districts: [], cities: [] };

export default function SalespersonCreateDistributorPage() {
  const router = useRouter();
  const { userData } = useAuth();
  const { products } = useProducts();

  const [gstNumber, setGstNumber] = useState("");
  const [firmName, setFirmName] = useState("");
  const [address, setAddress] = useState("");
  const [linkedFirmId, setLinkedFirmId] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [distributorType, setDistributorType] = useState<DistributorType | "">("");

  const [territory, setTerritory] = useState<Territory>(EMPTY_TERRITORY);
  const [assignedProducts, setAssignedProducts] = useState<AssignedProduct[]>([]);
  const [hasConflict, setHasConflict] = useState(false);

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const availableProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products],
  );

  const handleAutoFillState = (state: string) => {
    const normalized = state.trim();
    const matched = ALL_STATES.find(
      (s) => s.toLowerCase() === normalized.toLowerCase(),
    );
    if (matched) {
      setTerritory((prev) => ({
        ...prev,
        states: prev.states.includes(matched) ? prev.states : [...prev.states, matched],
      }));
    }
  };

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!firmName.trim()) next.firmName = "Firm name is required.";

    const phoneClean = phone.trim();
    if (!phoneClean) {
      next.phone = "Phone is required.";
    } else if (!/^[+\d\s\-()]{7,15}$/.test(phoneClean)) {
      next.phone = "Enter a valid phone number.";
    }

    const emailClean = email.trim();
    if (!emailClean) {
      next.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      next.email = "Enter a valid email address.";
    }

    if (!distributorType) {
      next.distributorType = "Select a distributor type.";
    }

    if (territory.states.length === 0) {
      next.territory = "Select at least one state.";
    }

    if (assignedProducts.length === 0) {
      next.assignedProducts = "Select at least one product.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (hasConflict) return;
    if (!userData?.uid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createDistributorInFirestore({
        name: toTitleCase(firmName.trim()),
        email: email.trim(),
        phone: phone.trim(),
        createdBy: userData.uid,
        gstNumber: gstNumber.trim() || undefined,
        address: address.trim() || undefined,
        assignedProducts,
        distributorType: distributorType || undefined,
        territory,
        linkedFirmId: linkedFirmId ?? undefined,
      });
      router.push("/dashboard/distributors");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to create distributor. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-0.5 pb-28 sm:px-6">
      <div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
              Distributors
            </p>
            <h1 className="text-lg font-semibold text-textPrimary">
              Create Distributor
            </h1>
          </div>
          <span className="ml-auto rounded-full bg-page px-3 py-1 text-xs font-medium text-textSecondary">
            New distributor account
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DistributorIdentitySection
          gstNumber={gstNumber}
          firmName={firmName}
          address={address}
          onGstChange={setGstNumber}
          onNameChange={(v) => {
            setFirmName(v);
            setErrors((p) => ({ ...p, firmName: undefined }));
          }}
          onAddressChange={setAddress}
          onLinkedFirmIdChange={setLinkedFirmId}
          onAutoFillState={handleAutoFillState}
          errors={{ firmName: errors.firmName }}
          disabled={isSubmitting}
        />

        <DistributorContactSection
          phone={phone}
          email={email}
          onPhoneChange={(v) => {
            setPhone(v);
            setErrors((p) => ({ ...p, phone: undefined }));
          }}
          onEmailChange={(v) => {
            setEmail(v);
            setErrors((p) => ({ ...p, email: undefined }));
          }}
          errors={errors}
          disabled={isSubmitting}
        />

        <div className="xl:col-span-2">
          <DistributorTypeSection
            value={distributorType}
            onChange={(t) => {
              setDistributorType(t);
              setAssignedProducts([]);
              setErrors((p) => ({ ...p, distributorType: undefined }));
            }}
            error={errors.distributorType}
            disabled={isSubmitting}
          />
        </div>

        <div className="xl:col-span-2">
          <DistributorCoverageSection
            distributorType={distributorType}
            territory={territory}
            onTerritoryChange={(t) => {
              setTerritory(t);
              setErrors((p) => ({ ...p, territory: undefined }));
            }}
            assignedProducts={assignedProducts}
            availableProducts={availableProducts}
            onProductsChange={(prods) => {
              setAssignedProducts(prods);
              setErrors((p) => ({ ...p, assignedProducts: undefined }));
            }}
            onConflictChange={setHasConflict}
            errors={errors}
            disabled={isSubmitting}
          />
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {submitError}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm lg:left-[var(--admin-sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-6xl gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/dashboard/distributors")}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={hasConflict || isSubmitting}
            className="flex-1"
          >
            Create Distributor
          </Button>
        </div>
      </div>
    </div>
  );
}
