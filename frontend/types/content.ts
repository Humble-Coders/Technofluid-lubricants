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
