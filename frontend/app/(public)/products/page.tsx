// File: frontend/app/(public)/products/page.tsx
import { catalogue, categorySlug } from "@/lib/catalogue";
import { BRAND } from "@/content/brand";
import ProductsHero from "./_components/ProductsHero";
import CategoryFilterTabs from "./_components/CategoryFilterTabs";
import ProductSearchBar from "./_components/ProductSearchBar";
import ProductsGrid from "./_components/ProductsGrid";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const activeSlug = category ?? null;
  const query = q?.trim().toLowerCase() ?? "";

  const series = catalogue.products.filter((p) => {
    if (activeSlug && categorySlug(p.category) !== activeSlug) return false;
    if (!query) return true;
    return [p.displayName, p.productType, p.subtitle, p.category]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(query));
  });

  return (
    <div className="relative overflow-hidden">
      {/* Dot-grid texture, top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
          backgroundSize: "18px 18px",
        }}
      />

      {/* Soft glow behind the hero heading */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full opacity-[0.14] blur-3xl"
        style={{
          background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
        }}
      />

      {/* Angled corner shape, left side */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 h-64 w-64 rotate-12 opacity-[0.06]"
        style={{
          background: BRAND.orange,
          clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
        }}
      />

      {/* Angled corner shape, bottom-right (anchors the grid/footer area) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rotate-[18deg] opacity-[0.06]"
        style={{
          background: BRAND.orange,
          clipPath: "polygon(20% 0, 100% 0, 80% 100%, 0 100%)",
        }}
      />

      <div className="relative">
        <ProductsHero />
        <ProductSearchBar />
        <CategoryFilterTabs activeSlug={activeSlug} />
        <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
          {series.length > 0 ? (
            <ProductsGrid series={series} />
          ) : (
            <p className="py-16 text-center text-[14px] text-textSecondary">
              {query
                ? `No products found matching "${q}".`
                : "No products found in this category."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
