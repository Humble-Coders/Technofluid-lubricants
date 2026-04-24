import type { Product } from "@/types/product";
import type { PriorityItem, RelatedFirm } from "@/types/visit";

export type FirmErrors = {
  gstNumber?: string;
  name?: string;
  monthly?: string;
  annually?: string;
};

export type RelatedFirmsSectionProps = {
  products: Product[];
  initialFirms?: RelatedFirm[];
  resetKey?: string;
  onChange: (firms: RelatedFirm[]) => void;
  errors?: Record<number, FirmErrors>;
};

export type InternalFirm = {
  _key: string;
  gstNumber: string;
  name: string;
  address: string;
  hasGst: boolean;
  monthly: PriorityItem[];
  annually: PriorityItem[];
};
