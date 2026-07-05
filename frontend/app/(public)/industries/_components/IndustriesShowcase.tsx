"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const industry of industries) {
      const key = getIndustrySector(industry.slug);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [industries]);

  const filtered = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    return industries.filter((industry) => {
      const matchesSector = !sector || getIndustrySector(industry.slug) === sector;
      const matchesQuery =
        !normalizedQuery || industry.name.toLowerCase().includes(normalizedQuery);
      return matchesSector && matchesQuery;
    });
  }, [industries, sector, debouncedQuery]);

  return (
    <section className="bg-page pb-14 pt-6 lg:pb-20 lg:pt-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative mb-4 max-w-md">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search industries…"
            className="w-full rounded-full border border-border bg-white py-2.5 pl-11 pr-4 text-[13px] text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: `${BRAND.orange}55` }}
          />
        </div>

        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 pr-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible lg:pb-0 lg:pr-0">
            <button
              type="button"
              onClick={() => setSector(null)}
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors"
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
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors"
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

          {/* Edge fade hinting horizontal scroll — mobile only, filters wrap on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-page to-transparent lg:hidden"
          />
        </div>

        <AnimatePresence mode="wait">
          {filtered.length > 0 ? (
            <motion.div
              key={`${sector ?? "all"}-${debouncedQuery.trim().toLowerCase()}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="mt-10"
            >
              <IndustriesCarousel
                industries={filtered}
                renderCard={(industry) => <IndustryShowcaseCard industry={industry} />}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="mt-10 rounded-2xl border border-dashed border-border bg-white py-16 text-center"
            >
              <p className="text-[15px] font-semibold text-textPrimary">
                {debouncedQuery.trim()
                  ? `No industries match "${debouncedQuery.trim()}".`
                  : "No industries in this sector yet."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
