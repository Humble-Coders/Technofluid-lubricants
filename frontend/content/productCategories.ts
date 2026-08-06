// File: frontend/content/productCategories.ts
// The five real catalogue categories (client taxonomy, Aug 2026). Shared by
// the public header/footer and the landing page's product-category band.

export interface ProductCategory {
  label: string;
  href: string;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    label: "Automotive Lubricants",
    href: "/products?category=automotive-lubricants",
  },
  { label: "Industrial Oils", href: "/products?category=industrial-oils" },
  {
    label: "Specialty Lubricants & Process Oils",
    href: "/products?category=specialty-lubricants-process-oils",
  },
  {
    label: "Agricultural Lubricants",
    href: "/products?category=agricultural-lubricants",
  },
  { label: "Grease", href: "/products?category=grease" },
];
