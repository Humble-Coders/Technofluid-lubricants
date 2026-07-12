// File: frontend/lib/catalogue.ts
import catalogueData from "@/content/catalogue.json";
import crosswalkData from "@/content/catalogue-crosswalk.json";
import productImagesData from "@/content/product-images.json";
import { BRAND } from "@/content/brand";
import { slugify } from "@/lib/services/productImport";
import type {
  CatalogueCategory,
  CatalogueContent,
  CatalogueSeries,
  CrosswalkContent,
  CrosswalkSeries,
  ProductImages,
  ProductImagesManifest,
} from "@/types/content";

export const catalogue = catalogueData as unknown as CatalogueContent;
export const crosswalk = crosswalkData as unknown as CrosswalkContent;
const productImages = productImagesData as unknown as ProductImagesManifest;

const CATEGORY_ACCENT: Record<CatalogueCategory, string> = {
  "Industrial Oils": BRAND.orange,
  "Automotive Lubricants": BRAND.red,
  Greases: BRAND.orangeDark,
  "Specialty Oils": BRAND.charcoal,
};

export function categoryAccent(category: CatalogueCategory): string {
  return CATEGORY_ACCENT[category] ?? BRAND.orange;
}

export function seriesSlug(series: CatalogueSeries | CrosswalkSeries): string {
  const title = "title" in series ? series.title : series.catalogueTitle;
  return slugify(title);
}

export function findSeriesBySlug(slug: string): CatalogueSeries | undefined {
  return catalogue.products.find((series) => seriesSlug(series) === slug);
}

export function findCrosswalkBySlug(slug: string): CrosswalkSeries | undefined {
  return crosswalk.series.find((series) => seriesSlug(series) === slug);
}

export function familiesForSeries(slug: string): string[] {
  const entry = findCrosswalkBySlug(slug);
  if (!entry || entry.status === "available-on-request" || entry.aspirational) {
    return [];
  }
  return entry.masterFamilies.map((family) => family.product);
}

export function productKeysForSeries(slug: string): string[] {
  return familiesForSeries(slug).map((product) => slugify(product));
}

export function categorySlug(category: string): string {
  return slugify(category);
}

export function imagesForSeries(slug: string): ProductImages | null {
  return productImages[slug] ?? null;
}
