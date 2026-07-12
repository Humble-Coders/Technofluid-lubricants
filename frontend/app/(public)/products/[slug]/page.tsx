// File: frontend/app/(public)/products/[slug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/content/brand";
import {
  categoryAccent,
  findCrosswalkBySlug,
  findSeriesBySlug,
  imagesForSeries,
} from "@/lib/catalogue";
import SeriesSpecTable from "./_components/SeriesSpecTable";
import SeriesPackSizes from "./_components/SeriesPackSizes";
import ProductGallery from "./_components/ProductGallery";

const SECTION_LABELS: Record<string, string> = {
  description: "Description",
  benefits: "Key Benefits",
  applications: "Applications",
  typicalUses: "Typical Uses",
  operatingCharacteristics: "Operating Characteristics",
  performanceStandards: "Performance Standards",
  monograde: "Monograde",
  multigrade: "Multigrade",
  gradesAvailable: "Grades Available",
  nlgiGuidance: "NLGI Guidance",
};

function sectionLabel(key: string): string {
  return (
    SECTION_LABELS[key] ??
    key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())
  );
}

export default async function ProductSeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const series = findSeriesBySlug(slug);

  if (!series) {
    notFound();
  }

  const crosswalkEntry = findCrosswalkBySlug(slug);
  const isAspirational =
    series.aspirational || crosswalkEntry?.status === "available-on-request";
  const accent = categoryAccent(series.category);
  const productImages = imagesForSeries(slug);

  const contentSections = series.sectionsOrder
    .map((key) => ({ key, items: series.sections[key] }))
    .filter((s) => s.items && s.items.length > 0);

  const descriptionSection = contentSections.find((s) => s.key === "description");
  const otherSections = contentSections.filter((s) => s.key !== "description");

  return (
    <article
      className="relative isolate overflow-x-clip"
      style={{ backgroundColor: `${accent}0a` }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(900px circle at 100% 0%, ${accent}0d, transparent 60%), radial-gradient(700px circle at 0% 60%, ${accent}0a, transparent 55%)`,
          }}
        />
        {/* Droplet motif, left edge, mid-page (breaks up the long content column) */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth="0.5"
          className="absolute -left-16 top-[42%] h-72 w-72 -rotate-[8deg] opacity-[0.06]"
        >
          <path d="M12 2.5s6.5 7.1 6.5 12A6.5 6.5 0 0 1 5.5 14.5C5.5 9.6 12 2.5 12 2.5Z" />
        </svg>

        {/* Faint outlined ring, centred behind the specifications area */}
        <div
          className="absolute left-1/2 top-[58%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-[0.05]"
          style={{ borderColor: accent, borderWidth: "1.5px" }}
        />
        <div
          className="absolute left-1/2 top-[58%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.15]"
          style={{ background: accent }}
        />

        {/* Flowing line strokes, right edge, near the sticky sidebar */}
        <svg
          aria-hidden
          viewBox="0 0 200 300"
          fill="none"
          className="absolute -right-6 top-[66%] h-72 w-48 opacity-[0.1]"
        >
          <path
            d="M10 10c60 20 20 60 80 80s20 60 80 80"
            stroke={accent}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M40 0c60 25 10 65 80 90s10 65 70 95"
            stroke={accent}
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>
      </div>

      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(620px circle at 12% -15%, ${accent}26, transparent 60%), radial-gradient(520px circle at 105% 10%, ${BRAND.peach}3d, transparent 55%), linear-gradient(180deg, #FAFAF8 0%, ${accent}0a 100%)`,
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          className="pointer-events-none absolute -right-16 -top-24 h-[340px] w-[340px] rotate-[18deg] opacity-[0.08] sm:-right-10 sm:-top-16 sm:h-[420px] sm:w-[420px]"
        >
          <path d="M12 2.5s6.5 7.1 6.5 12A6.5 6.5 0 0 1 5.5 14.5C5.5 9.6 12 2.5 12 2.5Z" />
        </svg>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          className="pointer-events-none absolute -bottom-10 left-[8%] hidden h-40 w-40 -rotate-[12deg] opacity-[0.07] sm:block"
        >
          <path d="M12 2.5s6.5 7.1 6.5 12A6.5 6.5 0 0 1 5.5 14.5C5.5 9.6 12 2.5 12 2.5Z" />
        </svg>

        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full"
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
        >
          <path
            d="M0,60 C240,110 480,10 720,45 C960,80 1200,20 1440,55 L1440,100 L0,100 Z"
            fill={accent}
            opacity="0.05"
          />
          <path
            d="M0,75 C280,40 560,95 840,60 C1080,30 1280,70 1440,50 L1440,100 L0,100 Z"
            fill={accent}
            opacity="0.08"
          />
        </svg>

        <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-10 lg:px-8">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-textSecondary transition-colors hover:text-textPrimary"
          >
            <span aria-hidden>←</span>
            Back to products
          </Link>

          <div className="mt-8 flex items-start gap-4">
            <span
              className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:flex"
              style={{ backgroundColor: `${accent}14`, color: accent }}
              aria-hidden
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2.5s6.5 7.1 6.5 12A6.5 6.5 0 0 1 5.5 14.5C5.5 9.6 12 2.5 12 2.5Z" />
              </svg>
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <p
                  className="text-[10.5px] font-bold uppercase tracking-[0.25em]"
                  style={{ color: accent }}
                >
                  {series.category}
                </p>
                {isAspirational && (
                  <span className="flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-textSecondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
                    On request
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.5rem]">
                {series.displayName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-[13.5px] font-medium text-textSecondary">
                  {series.productType}
                </p>
                {series.subtitle && (
                  <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[11.5px] font-medium text-textSecondary">
                    {series.subtitle}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-14 lg:grid-cols-[1fr_320px] lg:gap-16 lg:px-8">
        <div className="order-2 flex flex-col gap-8 lg:order-1">
          {descriptionSection && (
            <section
              className="relative overflow-hidden rounded-3xl border p-6 sm:p-8"
              style={{
                borderColor: `${accent}2e`,
                backgroundColor: `${accent}08`,
              }}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke={accent}
                strokeWidth="0.7"
                className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rotate-12 opacity-[0.12]"
              >
                <path d="M12 2.5s6.5 7.1 6.5 12A6.5 6.5 0 0 1 5.5 14.5C5.5 9.6 12 2.5 12 2.5Z" />
              </svg>
              <div className="relative flex flex-col gap-3">
                {descriptionSection.items.map((item, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-relaxed text-textPrimary"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </section>
          )}

          {otherSections.map(({ key, items }) => (
            <section
              key={key}
              className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8"
            >
              <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-textPrimary">
                {sectionLabel(key)}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${accent}17`, color: accent }}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <p className="text-[13.5px] leading-relaxed text-textSecondary">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="order-1 flex flex-col gap-5 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          {productImages && (
            <ProductGallery images={productImages} altBase={series.displayName} />
          )}

          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-textSecondary">
              At a glance
            </h2>
            <dl className="mt-4 flex flex-col gap-3.5">
              <div>
                <dt className="text-[11px] font-medium text-textSecondary">
                  Category
                </dt>
                <dd className="mt-0.5 text-[13.5px] font-semibold text-textPrimary">
                  {series.category}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-textSecondary">
                  Product type
                </dt>
                <dd className="mt-0.5 text-[13.5px] font-semibold text-textPrimary">
                  {series.productType}
                </dd>
              </div>
              {series.subtitle && (
                <div>
                  <dt className="text-[11px] font-medium text-textSecondary">
                    Grades
                  </dt>
                  <dd className="mt-0.5 text-[13.5px] font-semibold text-textPrimary">
                    {series.subtitle}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-textSecondary">
              Pack Sizes
            </h2>
            <div className="mt-4">
              <SeriesPackSizes slug={slug} aspirational={isAspirational} />
            </div>
          </div>
        </aside>
      </div>

      {series.specTables.length > 0 && (
        <div className="mx-auto max-w-6xl px-3 pb-14 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-border bg-white p-3 shadow-sm sm:p-6 lg:p-8">
            <h2 className="px-1 text-[13px] font-bold uppercase tracking-[0.15em] text-textPrimary sm:px-0">
              Specifications
            </h2>
            <div className="mt-4 space-y-6">
              {series.specTables.map((table, i) => (
                <SeriesSpecTable key={i} table={table} />
              ))}
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
