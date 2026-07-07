// File: frontend/app/(public)/industries/[slug]/page.tsx
import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import industriesData from "@/content/industries.json";
import { BRAND } from "@/content/brand";
import type { IndustriesContent } from "@/types/content";
import {
  getIndustryImage,
  getIndustrySector,
} from "../../_components/industryIcons";

const DATA = industriesData as IndustriesContent;

function findIndustryBySlug(slug: string) {
  return (
    DATA.industries.find((i) => i.slug === slug) ??
    (DATA.automotiveOils.slug === slug ? DATA.automotiveOils : undefined)
  );
}

export default async function IndustryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const industry = findIndustryBySlug(slug);

  if (!industry) {
    notFound();
  }

  const sector = getIndustrySector(industry.slug);
  const image = getIndustryImage(industry.slug);
  const linkedCount = industry.types.filter((t) => t.seriesSlug).length;
  const onRequestCount = industry.types.length - linkedCount;

  const availableTypes = industry.types.filter((t) => t.seriesSlug);
  const onRequestTypes = industry.types.filter((t) => !t.seriesSlug);

  const relatedIndustries = DATA.industries
    .filter(
      (i) => i.slug !== industry.slug && getIndustrySector(i.slug) === sector,
    )
    .slice(0, 4);

  return (
    <article className="relative isolate overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(900px circle at 100% 0%, ${BRAND.orange}0d, transparent 60%), radial-gradient(700px circle at 0% 60%, ${BRAND.orange}0a, transparent 55%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${BRAND.orange}22 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
            maskImage:
              "linear-gradient(to bottom, transparent, black 8%, black 96%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, black 8%, black 96%, transparent)",
          }}
        />

        {/* Thin diagonal brand-colour bands crossing the top corners */}
        <div
          className="absolute inset-0 opacity-[0.1]"
          style={{
            background: `linear-gradient(${BRAND.red} 0 0)`,
            clipPath: "polygon(0 0, 16% 0, 5% 34%, 0 34%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.1]"
          style={{
            background: `linear-gradient(${BRAND.peach} 0 0)`,
            clipPath: "polygon(88% 0, 100% 0, 100% 46%, 94% 46%)",
          }}
        />

        {/* Large soft ring accent anchoring the lower content area */}
        <div
          className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full opacity-[0.1] blur-3xl"
          style={{
            background: `conic-gradient(from 200deg, ${BRAND.orange} 0deg, ${BRAND.peach} 140deg, transparent 260deg)`,
          }}
        />

        {/* Dot-grid patch, left edge, mid-page (breaks up the long scroll) */}
        <div
          className="absolute left-0 top-[38%] h-72 w-72 -translate-x-1/2 opacity-[0.12]"
          style={{
            backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
            backgroundSize: "20px 20px",
            maskImage: "radial-gradient(circle, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, transparent 70%)",
          }}
        />

        {/* Angled polygon, right edge, mid-page */}
        <div
          className="absolute right-0 top-[55%] h-56 w-56 translate-x-1/3 rotate-12 opacity-[0.07]"
          style={{
            background: BRAND.orange,
            clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
          }}
        />

        {/* Soft glow behind the related-industries footer */}
        <div
          className="absolute bottom-[6%] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-[0.09] blur-3xl"
          style={{
            background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
          }}
        />

        {/* Faint outlined ring, dead centre of the types grid */}
        <div
          className="absolute left-1/2 top-[46%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-[0.06]"
          style={{ borderColor: BRAND.orange, borderWidth: "1.5px" }}
        />

        {/* Small solid accent dot, centre */}
        <div
          className="absolute left-1/2 top-[46%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.15]"
          style={{ background: BRAND.orange }}
        />
      </div>

      <section className="relative overflow-hidden border-b border-border">
        <div className="relative h-72 w-full sm:h-96">
          <Image src={image} alt={industry.name} fill priority className="object-cover" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/15"
          />
        </div>

        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 lg:px-8">
          <Link
            href="/industries"
            className="flex items-center gap-1.5 rounded-full bg-black/25 px-3.5 py-2 text-[12.5px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/40"
          >
            <span aria-hidden>←</span>
            Industries
          </Link>
        </div>

        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-6 pb-8 lg:px-8">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.25em]"
            style={{ color: BRAND.peach }}
          >
            {sector}
          </p>
          <h1 className="mt-2 max-w-2xl text-[1.9rem] font-extrabold leading-tight tracking-tight text-white sm:text-[2.4rem]">
            {industry.name}
          </h1>
          <p className="mt-3 text-[13px] font-medium text-white/80">
            {industry.types.length} recommended lubricant{" "}
            {industry.types.length === 1 ? "type" : "types"} for this
            industry&apos;s operating conditions
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-textPrimary">
            Lubricant types this industry needs
          </h2>
          <div className="flex items-center gap-2 text-[12px] font-medium text-textSecondary">
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: BRAND.orange }}
              />
              {linkedCount} in catalogue
            </span>
            {onRequestCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
                {onRequestCount} on request
              </span>
            )}
          </div>
        </div>

        <div
          className={`mt-8 grid grid-cols-1 gap-14 ${
            availableTypes.length > 0 && onRequestTypes.length > 0
              ? "lg:grid-cols-[1fr_1px_1fr] lg:gap-x-12"
              : ""
          }`}
        >
          {availableTypes.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.15em] text-textSecondary">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: BRAND.orange }}
                />
                Available now
              </h3>
              <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {availableTypes.map((type) => (
                  <Link
                    key={type.label}
                    href={`/products/${type.seriesSlug}`}
                    className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-transparent hover:shadow-xl"
                    style={{ "--accent": BRAND.orange } as CSSProperties}
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-1 scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100"
                      style={{ backgroundColor: BRAND.orange }}
                      aria-hidden
                    />

                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                        style={{ backgroundColor: `${BRAND.orange}14`, color: BRAND.orange }}
                        aria-hidden
                      >
                        <svg
                          width="18"
                          height="18"
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
                      <h4 className="flex-1 text-[15px] font-bold leading-snug text-textPrimary transition-colors duration-200 group-hover:text-[color:var(--accent)]">
                        {type.label}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-4">
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: BRAND.orange }}
                      >
                        View product
                      </span>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] transition-transform group-hover:translate-x-1"
                        style={{ backgroundColor: `${BRAND.orange}1A`, color: BRAND.orange }}
                        aria-hidden
                      >
                        →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {availableTypes.length > 0 && onRequestTypes.length > 0 && (
            <div aria-hidden className="hidden bg-border lg:block" />
          )}

          {onRequestTypes.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.15em] text-textSecondary">
                <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
                Available on request
              </h3>
              <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {onRequestTypes.map((type) => (
                  <div
                    key={type.label}
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-black/[0.015] p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-[#8a8a8a]"
                        aria-hidden
                      >
                        <svg
                          width="18"
                          height="18"
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
                      <h4 className="flex-1 text-[15px] font-bold leading-snug text-textPrimary">
                        {type.label}
                      </h4>
                    </div>

                    <div className="flex items-center border-t border-border pt-4">
                      <span className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-textSecondary">
                        On request
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {relatedIndustries.length > 0 && (
          <div className="mt-16 border-t border-border pt-8">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-textPrimary">
              Related industries in {sector}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {relatedIndustries.map((related) => (
                <Link
                  key={related.slug}
                  href={`/industries/${related.slug}`}
                  className="rounded-full border border-border bg-white px-4 py-2 text-[13px] font-medium text-textPrimary transition-colors hover:border-black/20"
                >
                  {related.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
