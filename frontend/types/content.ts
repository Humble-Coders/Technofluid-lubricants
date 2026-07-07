// File: frontend/types/content.ts

export interface CompanyContent {
  brandLine: string;
  tagline: string;
  certification: string;
  since: number;
  parentCompany: string;
  about: string;
  whyChooseUs: {
    intro: string;
    points: string[];
    closing: string;
  };
  ourCommitment: string;
}

export interface IndustryType {
  label: string;
  series: string | null;
  seriesSlug: string | null;
}

export interface Industry {
  name: string;
  slug: string;
  types: IndustryType[];
}

export interface IndustriesContent {
  source: string;
  summary: {
    industries: number;
    totalTypeMentions: number;
    linkedToSeries: number;
    unlinked: number;
    distinctUnlinkedTypes: number;
  };
  industries: Industry[];
  automotiveOils: Industry;
}

export type SpecTableRow = string[];
export type SpecTable = SpecTableRow[];

export type CatalogueCategory =
  | "Industrial Oils"
  | "Automotive Lubricants"
  | "Greases"
  | "Specialty Oils";

export interface CatalogueSeries {
  title: string;
  displayName: string;
  productType: string | null;
  subtitle: string | null;
  commercialName: string;
  category: CatalogueCategory;
  aspirational: boolean;
  sectionsOrder: string[];
  sections: Record<string, string[]>;
  specTables: SpecTable[];
}

export interface CatalogueContent {
  source: string;
  productCount: number;
  products: CatalogueSeries[];
}

export interface CrosswalkMasterFamily {
  product: string;
  skuCount: number;
  skus: string[];
}

export interface CrosswalkSeries {
  seriesId: number;
  catalogueTitle: string;
  commercialName: string;
  productType: string;
  aspirational: boolean;
  status: "mapped" | "available-on-request";
  skuCount: number;
  masterFamilies: CrosswalkMasterFamily[];
  needsConfirmation: boolean;
  confirmNote: string | null;
}

export interface PublicCatalogDoc {
  productKey: string;
  product: string;
  category: string;
  segment: string;
  packSizes: string[];
}

export interface CrosswalkContent {
  generatedFrom: { catalogue: string; master: string };
  summary: {
    seriesTotal: number;
    seriesMapped: number;
    seriesAvailableOnRequest: number;
    skusTotal: number;
    skusMapped: number;
    skusOrphan: number;
    needsConfirmation: number;
  };
  series: CrosswalkSeries[];
  orphanMasterProducts: unknown[];
}
