import Link from "next/link";
import { BRAND } from "@/content/brand";
import type { Industry } from "@/types/content";
import { getIndustryIcon } from "./industryIcons";

export const INDUSTRY_CARD_GRADIENTS = [
  `linear-gradient(135deg, ${BRAND.red}, ${BRAND.orange})`,
  `linear-gradient(135deg, ${BRAND.orange}, ${BRAND.peach})`,
  `linear-gradient(135deg, ${BRAND.peach}, ${BRAND.red})`,
  `linear-gradient(135deg, ${BRAND.orange}, ${BRAND.red})`,
];

export default function IndustryCard({
  industry,
  index,
}: {
  industry: Industry;
  index: number;
}) {
  const gradient =
    INDUSTRY_CARD_GRADIENTS[index % INDUSTRY_CARD_GRADIENTS.length];
  const sampleTypes = industry.types.slice(0, 3);

  return (
    <Link
      href={`/industries/${industry.slug}`}
      className="group relative flex h-full min-h-[400px] flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
    >
      {/* Top accent bar */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: gradient }}
      />

      {/* Faint corner texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-[0.07]"
        style={{ background: gradient }}
      />

      <div
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
        style={{ background: gradient }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {getIndustryIcon(industry.slug)}
        </svg>
      </div>

      <span className="relative line-clamp-4 text-[17px] font-bold leading-snug text-textPrimary">
        {industry.name}
      </span>

      <div className="relative flex flex-wrap gap-2">
        {sampleTypes.map((type) => (
          <span
            key={type.label}
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-textSecondary"
            style={{ backgroundColor: `${BRAND.orange}0D` }}
          >
            {type.label.replace(/\s*\([^)]*\)/g, "")}
          </span>
        ))}
      </div>

      <div className="relative flex-1" />

      <div className="relative flex items-center gap-2 border-t border-border pt-4">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: gradient }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-textSecondary">
          {industry.types.length} lubricant types recommended
        </span>
      </div>

      <span
        className="relative inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-white transition-transform group-hover:translate-x-1"
        style={{ background: gradient }}
      >
        Explore
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}
