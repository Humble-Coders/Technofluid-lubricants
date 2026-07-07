// File: frontend/app/(public)/products/_components/ProductSeriesCard.tsx
import Link from "next/link";
import type { CSSProperties } from "react";
import { categoryAccent, seriesSlug } from "@/lib/catalogue";
import type { CatalogueSeries } from "@/types/content";

export default function ProductSeriesCard({
  series,
}: {
  series: CatalogueSeries;
}) {
  const blurb = series.sections.description?.[0] ?? "";
  const accent = categoryAccent(series.category);

  return (
    <Link
      href={`/products/${seriesSlug(series)}`}
      className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-border bg-white p-6 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-transparent hover:shadow-xl focus-visible:-translate-y-1 focus-visible:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2"
      style={{ "--accent": accent } as CSSProperties}
    >
      <span
        className="absolute inset-x-0 top-0 h-1 scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100"
        style={{ backgroundColor: accent }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: `${accent}14`, color: accent }}
            aria-hidden
          >
            <svg
              width="16"
              height="16"
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
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.2em]"
            style={{ color: accent }}
          >
            {series.category}
          </p>
        </div>
        {series.aspirational && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-textSecondary">
            <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
            On request
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[17px] font-bold leading-snug text-textPrimary transition-colors duration-200 group-hover:text-[color:var(--accent)]">
          {series.displayName}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[12.5px] font-medium text-textSecondary">
            {series.productType}
          </p>
          {series.subtitle && (
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-textSecondary">
              {series.subtitle}
            </span>
          )}
        </div>
      </div>

      {blurb && (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-textSecondary">
          {blurb}
        </p>
      )}

      <div className="flex-1" />

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span
          className="text-[12px] font-semibold text-textSecondary transition-colors duration-200 group-hover:text-[color:var(--accent)]"
        >
          View series
        </span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] transition-all duration-300 group-hover:translate-x-1"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
          aria-hidden
        >
          →
        </span>
      </div>
    </Link>
  );
}
