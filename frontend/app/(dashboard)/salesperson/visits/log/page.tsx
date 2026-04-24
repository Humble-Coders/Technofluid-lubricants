// File: frontend/app/(dashboard)/salesperson/visits/log/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/lib/useAuth";
import { useProducts } from "@/lib/useProducts";
import {
  createLogVisit,
  getLogVisitById,
  updateLogVisit,
} from "@/lib/services/logVisitService";
import type { LogVisit } from "@/types/visit";
import { createOrUpdateFirm } from "@/lib/services/firmService";
import { useLogVisitForm } from "./_hooks/useLogVisitForm";
import { RelatedFirmsSection } from "./_components/RelatedFirmsSection";
import { VisitDetailsSection } from "./_components/VisitDetailsSection";
import { MediaSection } from "./_components/MediaSection";
import { PrioritiesSection } from "./_components/PrioritiesSection";
import { PageHeader } from "./_components/PageHeader";
import { BackButton } from "./_components/BackButton";
import { ActionBar } from "./_components/ActionBar";
import { ErrorAlert } from "./_components/ErrorAlert";
import { LoadingSpinner } from "./_components/LoadingSpinner";
import { FormSection } from "./_components/FormSection";

export default function LogVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userData } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const visitId = searchParams.get("visitId")?.trim() || null;
  const isEditing = Boolean(visitId);

  const form = useLogVisitForm();
  const [existingVisit, setExistingVisit] = useState<LogVisit | null>(null);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

  useEffect(() => {
    if (!visitId) {
      setExistingVisit(null);
      setVisitError(null);
      form.resetForm();
      return;
    }

    let active = true;
    setExistingVisit(null);
    form.resetForm();
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

    form.populateFromVisit(existingVisit);
  }, [existingVisit, form]);

  const handleSave = async (status: "draft" | "submitted") => {
    const isFullSubmit = status === "submitted";
    const input = form.validateAndGetInput(isFullSubmit);

    if (!input) {
      requestAnimationFrame(() => {
        document
          .querySelector("[role='alert']")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    if (!userData) return;
    form.setIsSubmitting(true);
    form.setSubmitError(null);

    try {
      // Save/update firm in firms collection if GST mode
      if (form.hasGst && form.gstNumber.trim() && form.firmName.trim()) {
        await createOrUpdateFirm(
          form.gstNumber.trim(),
          form.firmName.trim(),
          form.address.trim(),
          form.location || { lat: 0, lng: 0 },
          { monthly: form.monthlyPriorities, annually: form.annualPriorities },
        );
      }

      // Save related firms with GST to firms collection
      for (const relatedFirm of form.relatedFirms) {
        if (
          relatedFirm.hasGst &&
          relatedFirm.gstNumber?.trim() &&
          relatedFirm.name?.trim() &&
          relatedFirm.address?.trim()
        ) {
          await createOrUpdateFirm(
            relatedFirm.gstNumber.trim(),
            relatedFirm.name.trim(),
            relatedFirm.address.trim(),
            form.location || { lat: 0, lng: 0 },
            relatedFirm.priorities,
          );
        }
      }

      if (visitId) {
        await updateLogVisit(visitId, input, userData.uid, userData.name);
      } else {
        await createLogVisit(input, userData.uid, userData.name);
      }
      router.push("/salesperson/visits");
    } catch (err) {
      form.setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to save visit. Please try again.",
      );
      form.setIsSubmitting(false);
    }
  };

  if (productsLoading || visitLoading) {
    return <LoadingSpinner isVisitLoading={visitLoading} />;
  }

  if (visitError) {
    return <ErrorAlert message={visitError} />;
  }

  const formResetKey =
    (existingVisit?.id ?? (visitId ? `loading-${visitId}` : "new")) +
    `-reset-${form.prioritiesResetKey}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-0.5 pb-28 sm:px-6">
      <BackButton />

      <PageHeader isEditing={isEditing} firmName={existingVisit?.firmName} />

      <div className="grid gap-4 xl:grid-cols-2">
        <VisitDetailsSection
          hasGst={form.hasGst}
          onHasGstChange={(value) => {
            form.setHasGst(value);
            form.setErrors((p) => ({
              ...p,
              gstNumber: undefined,
              firmName: undefined,
            }));
          }}
          gstNumber={form.gstNumber}
          onGstNumberChange={form.setGstNumber}
          firmName={form.firmName}
          onFirmNameChange={form.setFirmName}
          address={form.address}
          onAddressChange={form.setAddress}
          location={form.location}
          errors={form.errors}
          onPrioritiesLoaded={(priorities) => {
            form.setMonthlyPriorities(priorities.monthly);
            form.setAnnualPriorities(priorities.annually);
          }}
          onPrioritiesReset={() => {
            form.setPrioritiesResetKey((prev) => prev + 1);
          }}
        />

        <MediaSection
          media={form.media}
          onMediaChange={form.setMedia}
          onLocationCaptured={form.setLocation}
          uploaderId={userData?.uid ?? null}
          errors={form.errors}
        />

        <PrioritiesSection
          products={products}
          monthlyItems={form.monthlyPriorities}
          onMonthlyChange={form.setMonthlyPriorities}
          annualItems={form.annualPriorities}
          onAnnualChange={form.setAnnualPriorities}
          resetKey={formResetKey}
          errors={form.errors}
        />

        <div className="xl:col-span-2">
          {/* ── 5. Related Firms ── */}
          <FormSection step={5} title="Related Firms" badge="Optional">
            <RelatedFirmsSection
              products={products}
              initialFirms={existingVisit?.relatedFirms ?? []}
              resetKey={formResetKey}
              onChange={form.setRelatedFirms}
              errors={form.errors.relatedFirms}
            />
          </FormSection>
        </div>
      </div>

      {/* Global error */}
      {form.submitError && <ErrorAlert message={form.submitError} />}

      {/* ── Action bar — fixed, offset by sidebar on desktop ── */}
      <ActionBar
        isEditing={isEditing}
        isSubmitting={form.isSubmitting}
        onSaveDraft={() => handleSave("draft")}
        onSaveSubmit={() => handleSave("submitted")}
      />
    </div>
  );
}
