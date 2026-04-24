import type { RelatedFirm } from "@/types/visit";

import type { InternalFirm } from "./relatedFirms.types";

export function makeEmptyFirm(): InternalFirm {
  return {
    _key: crypto.randomUUID(),
    gstNumber: "",
    name: "",
    address: "",
    hasGst: true,
    monthly: [],
    annually: [],
  };
}

export function toExternal(firm: InternalFirm): RelatedFirm {
  return {
    gstNumber: firm.hasGst ? firm.gstNumber : undefined,
    name: firm.name || undefined,
    address: firm.address || undefined,
    hasGst: firm.hasGst,
    priorities: { monthly: firm.monthly, annually: firm.annually },
  };
}

export function toInternal(firms: RelatedFirm[] = []): InternalFirm[] {
  return firms.map((firm) => ({
    _key: crypto.randomUUID(),
    gstNumber: firm.gstNumber || "",
    name: firm.name || "",
    address: firm.address || "",
    hasGst: firm.hasGst ?? true,
    monthly: firm.priorities.monthly,
    annually: firm.priorities.annually,
  }));
}
