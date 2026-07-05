import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/content/brand";
import type { Industry } from "@/types/content";
import { getIndustryImage, getIndustrySector } from "../../_components/industryIcons";

export default function IndustryShowcaseCard({
  industry,
}: {
  industry: Industry;
}) {
  const sector = getIndustrySector(industry.slug);
  const sampleTypes = industry.types.slice(0, 3);
  const image = getIndustryImage(industry.slug);

  return (
    <Link
      href={`/industries/${industry.slug}`}
      className="group flex h-full min-h-[320px] flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
    >
      {/* Image section */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={image}
          alt={industry.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p
          className="text-[10.5px] font-bold uppercase tracking-[0.25em]"
          style={{ color: BRAND.orange }}
        >
          {sector}
        </p>

        <span className="line-clamp-3 min-h-[74px] text-[18px] font-bold leading-snug text-textPrimary">
          {industry.name}
        </span>

        <div className="flex flex-col gap-1.5">
          {sampleTypes.map((type) => (
            <div key={type.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: BRAND.orange }}
              />
              <span className="line-clamp-1 text-[12.5px] text-textSecondary">
                {type.label.replace(/\s*\([^)]*\)/g, "")}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-textSecondary">
            {industry.types.length} lubricant types
          </span>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] transition-transform group-hover:translate-x-1"
            style={{ backgroundColor: `${BRAND.orange}1A`, color: BRAND.orange }}
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
