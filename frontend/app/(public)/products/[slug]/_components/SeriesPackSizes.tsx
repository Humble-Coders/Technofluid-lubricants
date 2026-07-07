// File: frontend/app/(public)/products/[slug]/_components/SeriesPackSizes.tsx
"use client";

import Link from "next/link";
import { BRAND } from "@/content/brand";
import { useSeriesPackSizes } from "@/lib/hooks/useSeriesPackSizes";

function AvailableOnRequest() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-black/[0.015] p-5 text-center">
      <p className="text-[13px] font-semibold text-textPrimary">
        Available on request
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-textSecondary">
        Not stocked in a fixed pack size yet — reach out and we&apos;ll
        confirm availability.
      </p>
      <Link
        href="/contact"
        style={{ backgroundColor: BRAND.orange }}
        className="mt-4 inline-block rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Enquire
      </Link>
    </div>
  );
}

export default function SeriesPackSizes({
  slug,
  aspirational,
}: {
  slug: string;
  aspirational: boolean;
}) {
  const { packSizes, isLoading, error } = useSeriesPackSizes(slug);

  if (aspirational) {
    return <AvailableOnRequest />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-[34px] w-16 animate-pulse rounded-full bg-black/[0.05]"
          />
        ))}
      </div>
    );
  }

  if (error || packSizes.length === 0) {
    return <AvailableOnRequest />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {packSizes.map((size) => (
        <span
          key={size}
          className="rounded-full border px-3.5 py-2 text-[12.5px] font-semibold"
          style={{ borderColor: `${BRAND.orange}33`, backgroundColor: `${BRAND.orange}0F`, color: BRAND.orange }}
        >
          {size}
        </span>
      ))}
    </div>
  );
}
