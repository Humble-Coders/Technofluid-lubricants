import * as admin from "firebase-admin";

export type PublicCatalogProduct = {
  productKey: string;
  product: string;
  category: string;
  segment: string;
  orderableUnit: string;
  active: boolean;
  deleted: boolean;
};

export type PublicCatalogDoc = {
  productKey: string;
  product: string;
  category: string;
  segment: string;
  packSizes: string[];
  updatedAt: admin.firestore.FieldValue;
};

/**
 * Builds the price-free public_catalog doc for one product family
 * (all variants sharing a productKey). Only active, non-deleted variants
 * contribute a pack size. Returns null if the family has no active variant
 * (caller should delete any existing doc in that case).
 */
export function buildPublicCatalogDoc(
  productKey: string,
  familyProducts: PublicCatalogProduct[],
): PublicCatalogDoc | null {
  const activeVariants = familyProducts.filter((p) => p.active && !p.deleted);
  if (activeVariants.length === 0) return null;

  const packSizes = Array.from(
    new Set(activeVariants.map((p) => p.orderableUnit)),
  );

  const { product, category, segment } = activeVariants[0];

  return {
    productKey,
    product,
    category,
    segment,
    packSizes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}
