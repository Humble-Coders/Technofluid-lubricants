// File: frontend/app/(public)/products/_components/ProductSeriesCard.tsx
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { categoryAccent, imagesForSeries, seriesSlug } from "@/lib/catalogue";
import type { CatalogueSeries } from "@/types/content";

export default function ProductSeriesCard({
  series,
}: {
  series: CatalogueSeries;
}) {
  const blurb = series.sections.description?.[0] ?? "";
  const accent = categoryAccent(series.category);
  const productImages = imagesForSeries(seriesSlug(series));
  const primaryLabel = productImages?.images.find(
    (image) => image.src === productImages.primary,
  )?.label;
  const cardImageAlt = [series.displayName, primaryLabel].filter(Boolean).join(" — ");

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

      <div className="relative -mx-6 -mt-6 aspect-[4/3] w-[calc(100%+3rem)] overflow-hidden border-b border-border bg-white">
        {productImages ? (
          <Image
            src={productImages.primary}
            alt={cardImageAlt}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="relative flex h-full w-full items-center justify-center"
            style={{ backgroundColor: `${accent}0a` }}
            aria-hidden
          >
            <Image
              src="/logo-no_bg.png"
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-contain p-10 opacity-90 transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
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
