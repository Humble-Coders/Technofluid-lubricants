// File: frontend/app/(public)/products/_components/ProductsGrid.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProductSeriesCard from "./ProductSeriesCard";
import type { CatalogueSeries } from "@/types/content";

const BATCH_SIZE = 9;

export default function ProductsGrid({ series }: { series: CatalogueSeries[] }) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset pagination whenever the filtered set changes (new search/category).
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [series]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((count) => Math.min(count + BATCH_SIZE, series.length));
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [series.length]);

  const visibleSeries = useMemo(
    () => series.slice(0, visibleCount),
    [series, visibleCount],
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
        {visibleSeries.map((s) => (
          <ProductSeriesCard key={s.title} series={s} />
        ))}
      </div>
      {visibleCount < series.length && (
        <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
      )}
    </>
  );
}
