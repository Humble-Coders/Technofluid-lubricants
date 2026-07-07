// File: frontend/app/(public)/products/_components/CategoryFilterTabs.tsx
import Link from "next/link";
import { BRAND } from "@/content/brand";
import { categorySlug } from "@/lib/catalogue";
import { PRODUCT_CATEGORIES } from "@/content/productCategories";

const TABS = [
  { label: "All", slug: null as string | null },
  ...PRODUCT_CATEGORIES.map((c) => ({
    label: c.label,
    slug: categorySlug(c.label),
  })),
];

export default function CategoryFilterTabs({
  activeSlug,
}: {
  activeSlug: string | null;
}) {
  return (
    <nav
      aria-label="Filter by category"
      className="flex flex-wrap justify-center gap-2 px-6 pb-10 lg:px-8"
    >
      {TABS.map((tab) => {
        const isActive = tab.slug === activeSlug;
        const href = tab.slug ? `/products?category=${tab.slug}` : "/products";
        return (
          <Link
            key={tab.label}
            href={href}
            style={
              isActive
                ? { backgroundColor: BRAND.orange, color: "white" }
                : undefined
            }
            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
              isActive
                ? ""
                : "border border-border text-textSecondary hover:border-black/20"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
