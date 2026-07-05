"use client";

import { useMemo, useState } from "react";
import { BRAND } from "@/content/brand";
import type { Industry } from "@/types/content";
import IndustriesCarousel from "../../_components/IndustriesCarousel";
import IndustryShowcaseCard from "./IndustryShowcaseCard";
import { getIndustrySector } from "../../_components/industryIcons";

export default function IndustriesShowcase({
  industries,
}: {
  industries: Industry[];
}) {
  const [sector, setSector] = useState<string | null>(null);

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const industry of industries) {
      const key = getIndustrySector(industry.slug);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [industries]);

  const filtered = useMemo(() => {
    if (!sector) return industries;
    return industries.filter((industry) => getIndustrySector(industry.slug) === sector);
  }, [industries, sector]);

  return (
    <section className="bg-page pb-14 pt-6 lg:pb-20 lg:pt-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSector(null)}
            className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors"
            style={
              sector === null
                ? { backgroundColor: BRAND.orange, color: "white" }
                : { backgroundColor: `${BRAND.orange}0D`, color: BRAND.charcoal }
            }
          >
            All industries <span className="opacity-60">({industries.length})</span>
          </button>
          {sectors.map(([key, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSector(key === sector ? null : key)}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors"
              style={
                sector === key
                  ? { backgroundColor: BRAND.orange, color: "white" }
                  : { backgroundColor: `${BRAND.orange}0D`, color: BRAND.charcoal }
              }
            >
              {key} <span className="opacity-60">({count})</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div className="mt-10">
            <IndustriesCarousel
              key={sector ?? "all"}
              industries={filtered}
              renderCard={(industry) => <IndustryShowcaseCard industry={industry} />}
            />
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-white py-16 text-center">
            <p className="text-[15px] font-semibold text-textPrimary">
              No industries in this sector yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
