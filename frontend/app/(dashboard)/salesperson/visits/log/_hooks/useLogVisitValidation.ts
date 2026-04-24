import type {
  LogVisit,
  MediaItem,
  PriorityItem,
  RelatedFirm,
} from "@/types/visit";

const MIN_ITEMS = 5;

export type FirmErrors = {
  gstNumber?: string;
  name?: string;
  monthly?: string;
  annually?: string;
};

export type FormErrors = {
  gstNumber?: string;
  firmName?: string;
  address?: string;
  media?: string;
  monthly?: string;
  annually?: string;
  relatedFirms?: Record<number, FirmErrors>;
};

export function validatePriorityList(
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

export function validateForm(
  gstNumber: string,
  firmName: string,
  hasGst: boolean,
  address: string,
  media: MediaItem[],
  monthly: PriorityItem[],
  annually: PriorityItem[],
  relatedFirms: RelatedFirm[],
  isFullSubmit: boolean,
): FormErrors {
  const errs: FormErrors = {};

  if (hasGst) {
    if (!gstNumber.trim()) errs.gstNumber = "GST Number is required.";
    if (!address.trim()) errs.address = "Address is required.";
  } else {
    if (!firmName.trim()) errs.firmName = "Firm name is required.";
  }

  if (media.length === 0) {
    errs.media = "At least 1 media (image/video) is required.";
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
