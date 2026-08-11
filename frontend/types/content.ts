// File: frontend/types/content.ts

export interface JourneyMilestone {
  year: string;
  title: string;
  text: string;
}

export interface Journey {
  heading: string;
  intro: string;
  milestones: JourneyMilestone[];
  closing: string;
}

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
  journey: Journey;
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
  | "Agricultural Lubricants"
  | "Specialty Lubricants & Process Oils"
  | "Grease";

export interface CatalogueSeries {
  title: string;
  displayName: string;
  productType: string | null;
  subtitle: string | null;
  commercialName: string;
  /** The category the series is filed under — its badge and accent colour. */
  category: CatalogueCategory;
  /**
   * Extra categories the series also appears under when browsing. Some
   * products genuinely serve two segments (e.g. UTTO is both an automotive
   * and an agricultural lubricant), so they are listed in both without being
   * duplicated in the catalogue.
   */
  alsoInCategories?: CatalogueCategory[];
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

export interface ProductImage {
  src: string;
  label: string;
  packSize: string | null;
  container: string;
}

export interface ProductImages {
  primary: string;
  images: ProductImage[];
}

export type ProductImagesManifest = Record<string, ProductImages>;

export interface ProductDataSheet {
  /** Public path of the PDF, e.g. "/data-sheets/technofluid-turbine-oil.pdf" */
  file: string;
  /** Shown on the download button when a series has more than one sheet. */
  label: string;
}

export interface ProductDataSheetsManifest {
  source: string;
  sheets: Record<string, ProductDataSheet[]>;
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
