// File: frontend/content/productCategories.ts
// The four real catalogue categories (docs/PRD.md, ticket PUB1). Shared by the
// public header/footer and the landing page's product-category band.

export interface ProductCategory {
  label: string;
  href: string;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { label: "Industrial oils", href: "/products?category=industrial-oils" },
  {
    label: "Automotive lubricants",
    href: "/products?category=automotive-lubricants",
  },
  { label: "Greases", href: "/products?category=greases" },
  { label: "Specialty oils", href: "/products?category=specialty-oils" },
];
