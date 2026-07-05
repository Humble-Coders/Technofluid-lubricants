import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/content/brand";
import type { Industry } from "@/types/content";
import { getIndustryImage } from "./industryIcons";

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
  const image = getIndustryImage(industry.slug);

  return (
    <Link
      href={`/industries/${industry.slug}`}
      className="group relative flex h-full min-h-[400px] flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
    >
      {/* Photo band */}
      <div className="relative h-64 w-full shrink-0 overflow-hidden bg-page">
        <Image
          src={image}
          alt=""
          fill
          priority={index < 4}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: gradient }}
        />
      </div>

      <div className="relative flex flex-1 flex-col gap-5 p-8 pt-4">
        <span className="line-clamp-4 text-[17px] font-bold leading-snug text-textPrimary">
          {industry.name}
        </span>

        <div className="flex flex-wrap gap-2">
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

        <div className="flex-1" />

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: gradient }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-textSecondary">
            {industry.types.length} lubricant types recommended
          </span>
        </div>

        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-white transition-transform group-hover:translate-x-1"
          style={{ background: gradient }}
        >
          Explore
          <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
