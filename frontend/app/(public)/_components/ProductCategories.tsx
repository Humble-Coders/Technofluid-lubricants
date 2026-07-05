"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { BRAND } from "@/content/brand";
import { PRODUCT_CATEGORIES } from "@/content/productCategories";

// Structural UI metadata (icon + gradient + optional photo), keyed by href — not client copy.
const CATEGORY_STYLE: Record<
  string,
  { icon: React.ReactNode; gradient: string; image?: string }
> = {
  // Oil drum — industrial oils
  "/products?category=industrial-oils": {
    gradient: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.orange})`,
    image: "/industrial-card.png",
    icon: (
      <>
        <rect x="6" y="4" width="12" height="17" rx="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 9h12M6 14h12" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 4V2.5M15 4V2.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  // Engine oil can with pour spout — automotive lubricants
  "/products?category=automotive-lubricants": {
    gradient: `linear-gradient(135deg, ${BRAND.orange}, ${BRAND.red})`,
    image: "/automobiles-card.png",
    icon: (
      <>
        <path
          d="M5 9h9l4-2.5v3L14 12H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7 12v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 15v3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  // Grease-gun cartridge — greases
  "/products?category=greases": {
    gradient: `linear-gradient(135deg, ${BRAND.peach}, ${BRAND.orange})`,
    image: "/greases-bg.png",
    icon: (
      <>
        <path d="M9 2h6v3H9V2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M8 5h8l1 4-1 12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1L7 9l1-4Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8.5 12h7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  // Lab flask — specialty oils
  "/products?category=specialty-oils": {
    gradient: `linear-gradient(135deg, ${BRAND.orange}, ${BRAND.peach})`,
    image: "/special-card.png",
    icon: (
      <>
        <path d="M9 2h6M10 2v6l-5.5 10a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 15h9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
};

export default function ProductCategories() {
  return (
    <section className="relative overflow-hidden bg-white pb-20 pt-14 lg:pb-28 lg:pt-20">
      {/* Diagonal graphic bands */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.charcoal} 0 0)`,
          opacity: 0.05,
          clipPath: "polygon(100% 15%, 100% 45%, 60% 100%, 45% 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.red} 0 0)`,
          opacity: 0.05,
          clipPath: "polygon(88% 0, 100% 0, 65% 100%, 52% 100%)",
        }}
      />

      {/* Ambient brand-colour wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full opacity-[0.08] blur-3xl"
        style={{
          background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 130deg, ${BRAND.peach} 240deg, transparent 340deg)`,
        }}
      />

      {/* Small diagonal accent, left side */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 top-24 h-40 w-40 opacity-[0.07]"
        style={{
          background: `linear-gradient(${BRAND.orange} 0 0)`,
          clipPath: "polygon(0 0, 55% 0, 20% 100%, 0 100%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8"
        >
          <div>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: BRAND.orange }}
            >
              What We Make
            </p>
            <h2 className="mt-3 text-[1.9rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.2rem]">
              Product Categories
            </h2>
          </div>
          <div
            className="h-1.5 w-24 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.orange}, ${BRAND.peach})`,
            }}
          />
        </motion.div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_CATEGORIES.map((category, index) => {
            const style = CATEGORY_STYLE[category.href];
            return (
              <motion.div
                key={category.href}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.08 }}
              >
              <Link
                href={category.href}
                className="group relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
              >
                <div
                  className="relative flex aspect-[4/3] items-center justify-center overflow-hidden"
                  style={style.image ? undefined : { background: style.gradient }}
                >
                  {style.image ? (
                    <>
                      <Image
                        src={style.image}
                        alt={category.label}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {/* Gradient scrim for badge/icon contrast over the photo */}
                      <div
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
                      />
                    </>
                  ) : (
                    <>
                      {/* Texture: dot grid */}
                      <div
                        aria-hidden
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage:
                            "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
                          backgroundSize: "14px 14px",
                        }}
                      />

                      {/* Ghost icon watermark, background depth */}
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/[0.12]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                      >
                        {style.icon}
                      </svg>
                    </>
                  )}

                  {/* Icon chip */}
                  {!style.image && (
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/25 bg-white/15 shadow-inner backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-10 w-10 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        {style.icon}
                      </svg>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-bold text-textPrimary">
                      {category.label}
                    </span>
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] transition-transform group-hover:translate-x-1"
                      style={{ backgroundColor: `${BRAND.orange}1A`, color: BRAND.orange }}
                    >
                      →
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: style.gradient }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-textSecondary">
                      Browse catalogue
                    </span>
                  </div>
                </div>

                {/* Bottom accent bar */}
                <div
                  className="h-1 w-full scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{ background: style.gradient }}
                />
              </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
