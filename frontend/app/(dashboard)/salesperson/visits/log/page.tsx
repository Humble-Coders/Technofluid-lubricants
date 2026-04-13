// File: frontend/app/(dashboard)/salesperson/visits/log/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MediaUploader } from "@/components/ui/MediaUploader";
import { PriorityList } from "@/components/ui/PriorityList";
import { useAuth } from "@/lib/useAuth";
import { useProducts } from "@/lib/useProducts";
import { createLogVisit } from "@/lib/services/logVisitService";
import type {
  LogVisitInput,
  MediaItem,
  PriorityItem,
  RelatedFirm,
} from "@/types/visit";
import { GeolocationCapture } from "./_components/GeolocationCapture";
import { RelatedFirmsSection } from "./_components/RelatedFirmsSection";

const MIN_ITEMS = 5;

// ─── Validation ──────────────────────────────────────────────────────────────

type FirmErrors = {
  name?: string;
  monthly?: string;
  annually?: string;
};

type FormErrors = {
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
  firmName: string,
  monthly: PriorityItem[],
  annually: PriorityItem[],
  relatedFirms: RelatedFirm[],
  isFullSubmit: boolean,
): FormErrors {
  const errs: FormErrors = {};

  if (!firmName.trim()) errs.firmName = "Firm name is required.";

  if (isFullSubmit) {
    const me = validatePriorityList(monthly, "Monthly priorities", true);
    if (me) errs.monthly = me;

    const ae = validatePriorityList(annually, "Annual priorities", true);
    if (ae) errs.annually = ae;

    const fe: Record<number, FirmErrors> = {};
    relatedFirms.forEach((firm, i) => {
      const r: FirmErrors = {};
      if (!firm.name.trim()) r.name = "Firm name is required.";
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
  const { userData } = useAuth();
  const { products, loading: productsLoading } = useProducts();

  const [firmName, setFirmName] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationError, setLocationError] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [monthlyPriorities, setMonthlyPriorities] = useState<PriorityItem[]>(
    [],
  );
  const [annualPriorities, setAnnualPriorities] = useState<PriorityItem[]>([]);
  const [relatedFirms, setRelatedFirms] = useState<RelatedFirm[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSave = async (status: "draft" | "submitted") => {
    const isFullSubmit = status === "submitted";
    const validationErrors = validateForm(
      firmName,
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
      firmName: firmName.trim(),
      status,
      location,
      media,
      priorities: { monthly: monthlyPriorities, annually: annualPriorities },
      relatedFirms,
    };

    try {
      await createLogVisit(input, userData.uid, userData.name);
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

  if (productsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-textSecondary">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm">Loading products…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-0.5 pb-28 sm:px-6">
      {/* ── Back nav ── */}
      <button
        type="button"
        onClick={() => router.back()}
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

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── 1. Visit Details ── */}
        <FormSection step={1} title="Visit Details">
          <div className="space-y-5">
            <Input
              id="firm-name"
              label="Firm Name"
              placeholder="Enter the firm name"
              value={firmName}
              onChange={(e) => {
                setFirmName(e.target.value);
                if (errors.firmName)
                  setErrors((p) => ({ ...p, firmName: undefined }));
              }}
              error={errors.firmName}
            />
            <GeolocationCapture
              location={location}
              onCapture={(loc) => {
                setLocation(loc);
                setLocationError("");
              }}
              onError={setLocationError}
              error={locationError}
            />
          </div>
        </FormSection>

        {/* ── 2. Media ── */}
        <FormSection step={2} title="Media" badge="Optional">
          {userData?.uid ? (
            <MediaUploader
              items={media}
              uploaderId={userData.uid}
              onChange={setMedia}
            />
          ) : null}
        </FormSection>

        {/* ── 3. Monthly Priorities ── */}
        <FormSection step={3} title="Monthly Priorities" badge="Min 5 items">
          <PriorityList
            products={products}
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
            Save Draft
          </Button>
          <Button
            type="button"
            onClick={() => handleSave("submitted")}
            isLoading={isSubmitting}
            className="flex-1"
          >
            Submit Visit
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
