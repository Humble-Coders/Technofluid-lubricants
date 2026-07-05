import { BRAND } from "@/content/brand";
import type { Industry } from "@/types/content";

export default function IndustriesMarquee({
  industries,
}: {
  industries: Industry[];
}) {
  const names = industries.map((industry) => industry.name);
  const strip = [...names, ...names];

  return (
    <div
      aria-hidden
      className="marquee-wrap relative overflow-hidden border-y border-border bg-white py-4"
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent"
      />

      <div className="marquee-track flex w-max gap-8">
        {strip.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="flex shrink-0 items-center gap-8 text-[13px] font-semibold uppercase tracking-[0.1em] text-textSecondary"
          >
            {name}
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: BRAND.orange }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
