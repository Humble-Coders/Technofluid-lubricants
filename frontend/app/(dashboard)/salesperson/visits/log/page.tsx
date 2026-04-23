// File: frontend/app/(dashboard)/salesperson/visits/log/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MediaUploader } from "@/components/ui/MediaUploader";
import { PriorityList } from "@/components/ui/PriorityList";
import { useAuth } from "@/lib/useAuth";
import { useProducts } from "@/lib/useProducts";
import {
  createLogVisit,
  getLogVisitById,
  updateLogVisit,
} from "@/lib/services/logVisitService";
import type {
  LogVisit,
  LogVisitInput,
  MediaItem,
  PriorityItem,
  RelatedFirm,
} from "@/types/visit";
import { RelatedFirmsSection } from "./_components/RelatedFirmsSection";
import { FirmLookup } from "./_components/FirmLookup";
import { createOrUpdateFirm } from "@/lib/services/firmService";

const MIN_ITEMS = 5;

// ─── Validation ──────────────────────────────────────────────────────────────

type FirmErrors = {
  gstNumber?: string;
  name?: string;
  monthly?: string;
  annually?: string;
};

type FormErrors = {
  gstNumber?: string;
  firmName?: string;
  monthly?: string;
  annually?: string;
  relatedFirms?: Record<number, FirmErrors>;
};

function validatePriorityList(
  items: PriorityItem[],
  label: string,
  required: boolean,
): string | undefined {
  if (!required && items.length === 0) return undefined;
  if (items.length < MIN_ITEMS)
    return `${label} requires at least ${MIN_ITEMS} items.`;
  if (items.some((i) => !i.productId || i.quantity < 1))
    return `Every ${label.toLowerCase()} item needs a product and quantity > 0.`;
  return undefined;
}

function validateForm(
  gstNumber: string,
  firmName: string,
  hasGst: boolean,
  monthly: PriorityItem[],
  annually: PriorityItem[],
  relatedFirms: RelatedFirm[],
  isFullSubmit: boolean,
): FormErrors {
  const errs: FormErrors = {};

  if (hasGst) {
    if (!gstNumber.trim()) errs.gstNumber = "GST Number is required.";
  } else {
    if (!firmName.trim()) errs.firmName = "Firm name is required.";
  }

  if (isFullSubmit) {
    const me = validatePriorityList(monthly, "Monthly priorities", true);
    if (me) errs.monthly = me;

    const ae = validatePriorityList(annually, "Annual priorities", true);
    if (ae) errs.annually = ae;

    const fe: Record<number, FirmErrors> = {};
    relatedFirms.forEach((firm, i) => {
      const r: FirmErrors = {};
      if (firm.hasGst) {
        if (!firm.gstNumber?.trim()) r.gstNumber = "GST Number is required.";
      } else {
        if (!firm.name?.trim()) r.name = "Firm name is required.";
      }
      const m = validatePriorityList(
        firm.priorities.monthly,
        "Monthly priorities",
        true,
      );
      if (m) r.monthly = m;
      const a = validatePriorityList(
        firm.priorities.annually,
        "Annual priorities",
        false,
      );
      if (a) r.annually = a;
      if (Object.keys(r).length) fe[i] = r;
    });
    if (Object.keys(fe).length) errs.relatedFirms = fe;
  }

  return errs;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userData } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const visitId = searchParams.get("visitId")?.trim() || null;
  const isEditing = Boolean(visitId);

  const [gstNumber, setGstNumber] = useState("");
  const [firmName, setFirmName] = useState("");
  const [address, setAddress] = useState("");
  const [hasGst, setHasGst] = useState(true);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [monthlyPriorities, setMonthlyPriorities] = useState<PriorityItem[]>(
    [],
  );
  const [annualPriorities, setAnnualPriorities] = useState<PriorityItem[]>([]);
  const [relatedFirms, setRelatedFirms] = useState<RelatedFirm[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingVisit, setExistingVisit] = useState<LogVisit | null>(null);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

  const resetForm = () => {
    setGstNumber("");
    setFirmName("");
    setAddress("");
    setHasGst(true);
    setLocation(null);
    setMedia([]);
    setMonthlyPriorities([]);
    setAnnualPriorities([]);
    setRelatedFirms([]);
    setErrors({});
    setSubmitError(null);
  };

  useEffect(() => {
    if (!visitId) {
      setExistingVisit(null);
      setVisitError(null);
      resetForm();
      return;
    }

    let active = true;
    setExistingVisit(null);
    resetForm();
    setVisitLoading(true);
    setVisitError(null);

    getLogVisitById(visitId)
      .then((visit) => {
        if (!active) return;
        setExistingVisit(visit);
        if (!visit) {
          setVisitError("The selected visit could not be found.");
        }
      })
      .catch((error) => {
        if (!active) return;
        setVisitError(
          error instanceof Error ? error.message : "Failed to load visit.",
        );
      })
      .finally(() => {
        if (active) {
          setVisitLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visitId]);

  useEffect(() => {
    if (!existingVisit) return;

    setGstNumber(existingVisit.gstNumber || "");
    setFirmName(existingVisit.firmName || "");
    setAddress(existingVisit.address || "");
    setHasGst(existingVisit.hasGst ?? true);
    setLocation(existingVisit.location);
    setMedia(existingVisit.media);
    setMonthlyPriorities(existingVisit.priorities.monthly);
    setAnnualPriorities(existingVisit.priorities.annually);
    setRelatedFirms(existingVisit.relatedFirms);
  }, [existingVisit]);

  const handleSave = async (status: "draft" | "submitted") => {
    const isFullSubmit = status === "submitted";
    const validationErrors = validateForm(
      gstNumber,
      firmName,
      hasGst,
      monthlyPriorities,
      annualPriorities,
      relatedFirms,
      isFullSubmit,
    );

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      requestAnimationFrame(() => {
        document
          .querySelector("[role='alert']")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    if (!userData) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const input: LogVisitInput = {
      gstNumber: hasGst ? gstNumber.trim() : undefined,
      firmName: !hasGst ? firmName.trim() : undefined,
      address: address.trim() || undefined,
      hasGst,
      status,
      location,
      media,
      priorities: { monthly: monthlyPriorities, annually: annualPriorities },
      relatedFirms,
    };

    try {
      // Save/update firm in firms collection if GST mode
      if (hasGst && gstNumber.trim() && location) {
        await createOrUpdateFirm(
          gstNumber.trim(),
          firmName.trim(),
          address.trim(),
          location,
          { monthly: monthlyPriorities, annually: annualPriorities },
        );
      }

      if (visitId) {
        await updateLogVisit(visitId, input, userData.uid, userData.name);
      } else {
        await createLogVisit(input, userData.uid, userData.name);
      }
      router.push("/salesperson/visits");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to save visit. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  if (productsLoading || visitLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-textSecondary">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm">
            {visitLoading ? "Loading visit…" : "Loading products…"}
          </p>
        </div>
      </div>
    );
  }

  if (visitError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">{visitError}</div>
    );
  }

  const formResetKey =
    existingVisit?.id ?? (visitId ? `loading-${visitId}` : "new");
  const saveLabel = isEditing ? "Update" : "Save";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-0.5 pb-28 sm:px-6">
      {/* ── Back nav ── */}
      <button
        type="button"
        onClick={() => router.push("/salesperson/visits")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-textSecondary transition hover:text-textPrimary"
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
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to Visits
      </button>

      <div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
              {isEditing ? "Edit Visit" : "Log Visit"}
            </p>
            <h1 className="text-lg font-semibold text-textPrimary">
              {isEditing
                ? (existingVisit?.firmName ?? "Loading visit")
                : "New visit log"}
            </h1>
          </div>
          <span className="ml-auto rounded-full bg-page px-3 py-1 text-xs font-medium text-textSecondary">
            {isEditing ? "Update an existing record" : "Create a new record"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── 1. Visit Details ── */}
        <FormSection step={1} title="Visit Details">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <span className="text-sm font-medium text-textSecondary">
                    No GST
                  </span>
                  <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-border transition-colors"
                    style={{
                      backgroundColor: !hasGst ? "var(--color-accent)" : "var(--color-border)"
                    }}>
                    <div className="absolute h-4 w-4 rounded-full bg-white transition-transform"
                      style={{
                        transform: !hasGst ? "translateX(17px)" : "translateX(2px)"
                      }} />
                    <input
                      type="checkbox"
                      checked={!hasGst}
                      onChange={(e) => {
                        setHasGst(!e.target.checked);
                        setErrors((p) => ({
                          ...p,
                          gstNumber: undefined,
                          firmName: undefined,
                        }));
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
                  onGstChange={setGstNumber}
                  onNameChange={setFirmName}
                  onAddressChange={setAddress}
                  onPrioritiesLoaded={(priorities) => {
                    setMonthlyPriorities(priorities.monthly);
                    setAnnualPriorities(priorities.annually);
                  }}
                  error={errors.gstNumber}
                />
              ) : (
                <>
                  <Input
                    id="firm-name-manual"
                    label="Name"
                    placeholder="Enter the firm name"
                    value={firmName}
                    onChange={(e) => {
                      setFirmName(e.target.value);
                      if (errors.firmName)
                        setErrors((p) => ({ ...p, firmName: undefined }));
                    }}
                    error={errors.firmName}
                  />
                  <Input
                    id="address"
                    label="Address"
                    placeholder="Enter the address"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      if (errors.firmName)
                        setErrors((p) => ({ ...p, firmName: undefined }));
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

        {/* ── 2. Media ── */}
        <FormSection step={2} title="Media" badge="Optional">
          {userData?.uid ? (
            <MediaUploader
              items={media}
              uploaderId={userData.uid}
              onChange={setMedia}
              onLocationCaptured={setLocation}
            />
          ) : null}
        </FormSection>

        {/* ── 3. Monthly Priorities ── */}
        <FormSection step={3} title="Monthly Priorities" badge="Min 5 items">
          <PriorityList
            products={products}
            initialItems={existingVisit?.priorities.monthly ?? []}
            resetKey={formResetKey}
            onChange={setMonthlyPriorities}
            minItems={MIN_ITEMS}
            required
            error={errors.monthly}
          />
        </FormSection>

        {/* ── 4. Annual Priorities ── */}
        <FormSection step={4} title="Annual Priorities" badge="Min 5 items">
          <PriorityList
            products={products}
            initialItems={existingVisit?.priorities.annually ?? []}
            resetKey={formResetKey}
            onChange={setAnnualPriorities}
            minItems={MIN_ITEMS}
            required
            error={errors.annually}
          />
        </FormSection>

        <div className="xl:col-span-2">
          {/* ── 5. Related Firms ── */}
          <FormSection step={5} title="Related Firms" badge="Optional">
            <RelatedFirmsSection
              products={products}
              initialFirms={existingVisit?.relatedFirms ?? []}
              resetKey={formResetKey}
              onChange={setRelatedFirms}
              errors={errors.relatedFirms}
            />
          </FormSection>
        </div>
      </div>

      {/* Global error */}
      {submitError && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {submitError}
        </div>
      )}

      {/* ── Action bar — fixed, offset by sidebar on desktop ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm lg:left-(--admin-sidebar-width,16rem)">
        <div className="mx-auto flex max-w-6xl gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleSave("draft")}
            isLoading={isSubmitting}
            className="flex-1"
          >
            {saveLabel} Draft
          </Button>
          <Button
            type="button"
            onClick={() => handleSave("submitted")}
            isLoading={isSubmitting}
            className="flex-1"
          >
            {saveLabel} Visit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── FormSection ─────────────────────────────────────────────────────────────

type FormSectionProps = {
  step: number;
  title: string;
  badge?: string;
  children: React.ReactNode;
};

function FormSection({ step, title, badge, children }: FormSectionProps) {
  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accentContrast">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-textPrimary">{title}</h2>
        {badge && (
          <span className="ml-auto rounded-full bg-page px-2.5 py-0.5 text-xs font-medium text-textSecondary">
            {badge}
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}
