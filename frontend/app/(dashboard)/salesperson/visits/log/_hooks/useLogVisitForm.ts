import { useCallback, useState } from "react";
import type {
  LogVisit,
  LogVisitInput,
  MediaItem,
  PriorityItem,
  RelatedFirm,
} from "@/types/visit";
import { validateForm, type FormErrors } from "./useLogVisitValidation";

export function useLogVisitForm(initialVisit?: LogVisit | null) {
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
  const [prioritiesResetKey, setPrioritiesResetKey] = useState(0);

  const resetForm = useCallback(() => {
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
  }, []);

  const populateFromVisit = useCallback((visit: LogVisit) => {
    setGstNumber(visit.gstNumber || "");
    setFirmName(visit.firmName || "");
    setAddress(visit.address || "");
    setHasGst(visit.hasGst ?? true);
    setLocation(visit.location);
    setMedia(visit.media);
    setMonthlyPriorities(visit.priorities.monthly);
    setAnnualPriorities(visit.priorities.annually);
    setRelatedFirms(visit.relatedFirms);
  }, []);

  const validateAndGetInput = useCallback(
    (isFullSubmit: boolean): LogVisitInput | null => {
      const validationErrors = validateForm(
        gstNumber,
        firmName,
        hasGst,
        address,
        media,
        monthlyPriorities,
        annualPriorities,
        relatedFirms,
        isFullSubmit,
      );

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return null;
      }

      return {
        gstNumber: hasGst ? gstNumber.trim() : undefined,
        firmName: firmName.trim() || undefined,
        address: address.trim() || undefined,
        hasGst,
        status: isFullSubmit ? "submitted" : "draft",
        location,
        media,
        priorities: { monthly: monthlyPriorities, annually: annualPriorities },
        relatedFirms,
      };
    },
    [
      gstNumber,
      firmName,
      hasGst,
      address,
      media,
      monthlyPriorities,
      annualPriorities,
      relatedFirms,
      location,
    ],
  );

  return {
    // State
    gstNumber,
    firmName,
    address,
    hasGst,
    location,
    media,
    monthlyPriorities,
    annualPriorities,
    relatedFirms,
    errors,
    isSubmitting,
    submitError,
    prioritiesResetKey,

    // Setters
    setGstNumber,
    setFirmName,
    setAddress,
    setHasGst,
    setLocation,
    setMedia,
    setMonthlyPriorities,
    setAnnualPriorities,
    setRelatedFirms,
    setErrors,
    setIsSubmitting,
    setSubmitError,
    setPrioritiesResetKey,

    // Methods
    resetForm,
    populateFromVisit,
    validateAndGetInput,
  };
}
