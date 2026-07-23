"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import company from "@/content/company.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";
import HeroCarousel from "./HeroCarousel";

const COMPANY = company as CompanyContent;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export default function Hero() {
  return (
    <section className="relative flex flex-col overflow-hidden border-b border-border bg-white lg:min-h-[calc(100vh-70px)]">
      <div className="relative flex flex-1 flex-col lg:flex-row">
        {/* Copy — left half */}
        <div className="relative z-10 flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:pl-20 lg:pr-12 lg:py-24 xl:pl-24">
          {/* Background image — mobile only, scoped to this column so its
              foreground detail lands behind the copy, not the carousel below */}
          <div aria-hidden className="absolute inset-0 lg:hidden">
            <Image
              src="/hero-mobile-bg.png"
              alt=""
              fill
              priority
              className="object-cover object-right-bottom opacity-20"
            />
          </div>

          {/* Bold ambient colour wash */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 -top-32 hidden h-[560px] w-[560px] transform-gpu rounded-full opacity-[0.22] blur-3xl lg:block"
            style={{
              background: `conic-gradient(from -40deg, ${BRAND.red} 0deg, ${BRAND.orange} 120deg, ${BRAND.peach} 220deg, transparent 320deg)`,
            }}
          />

          {/* Bold ring graphic, colour mass */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 right-4 hidden h-72 w-72 rounded-full sm:block"
            style={{
              background: `conic-gradient(from 0deg, ${BRAND.orange} 0deg, ${BRAND.orange} 80deg, transparent 80deg 360deg)`,
              opacity: 0.18,
              maskImage:
                "radial-gradient(circle, transparent 62%, black 63%, black 100%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 62%, black 63%, black 100%)",
            }}
          />

          {/* Vertical spec rail, engineering-drawing style */}
          <div className="pointer-events-none absolute bottom-16 left-6 top-16 hidden w-px bg-border lg:block">
            <span
              className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: BRAND.orange }}
            />
            <span
              className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: BRAND.orange }}
            />
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.35em] text-textSecondary"
              style={{ writingMode: "vertical-rl" }}
            >
              Est. {COMPANY.since} — Precision Engineered
            </span>
          </div>

          <motion.div
            className="relative max-w-xl"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {/* Corner brackets, CAD/blueprint framing */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-4 -top-4 hidden h-6 w-6 border-l-2 border-t-2 sm:block"
              style={{ borderColor: BRAND.orange }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-4 -right-4 hidden h-6 w-6 border-b-2 border-r-2 sm:block"
              style={{ borderColor: BRAND.orange }}
            />

            <motion.div variants={fadeUp}>
              <Image
                src="/logo-no_bg.png"
                alt={COMPANY.brandLine}
                width={280}
                height={72}
                priority
                className="h-32 w-auto lg:h-48"
              />
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-6 flex items-center gap-3"
            >
              <span
                className="h-px w-8"
                style={{ backgroundColor: BRAND.red }}
              />
              <p
                className="text-[13px] font-semibold"
                style={{ color: BRAND.red }}
              >
                {COMPANY.certification}
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4"
            >
              <Link
                href="/products"
                style={{ backgroundColor: BRAND.orange }}
                className="rounded-lg px-6 py-3 text-center text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Explore products
              </Link>
              <Link
                href="/contact"
                className="rounded-lg border border-border px-6 py-3 text-center text-[13px] font-semibold text-textPrimary transition-colors hover:bg-page"
              >
                Enquire
              </Link>
            </motion.div>

            {/* Colourful trust strip */}
            <motion.div
              variants={fadeUp}
              className="mt-10 grid grid-cols-2 gap-3"
            >
              <div
                className="rounded-xl px-3 py-3 sm:px-4"
                style={{ backgroundColor: `${BRAND.orange}14` }}
              >
                <p
                  className="text-base font-extrabold leading-none sm:text-[1.3rem]"
                  style={{ color: BRAND.orange }}
                >
                  Since {COMPANY.since}
                </p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-textPrimary sm:text-[10px] sm:tracking-[0.15em] lg:text-textSecondary">
                  Powered by Experience
                </p>
              </div>
              <div
                className="rounded-xl px-3 py-3 sm:px-4"
                style={{ backgroundColor: `${BRAND.charcoal}0D` }}
              >
                <p
                  className="text-base font-extrabold leading-none sm:text-[1.3rem]"
                  style={{ color: BRAND.charcoal }}
                >
                  ISO 9001
                </p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-textPrimary sm:text-[10px] sm:tracking-[0.15em] lg:text-textSecondary">
                  Certified Quality
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Carousel — full-bleed right half, diagonal partition on desktop */}
        <div className="relative h-72 w-full sm:h-96 lg:h-auto lg:w-1/2 lg:[clip-path:polygon(12%_0%,100%_0%,100%_100%,0%_100%)]">
          <HeroCarousel />
        </div>

        {/* Thin brand-colour seam along the diagonal cut */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 lg:block lg:[clip-path:polygon(12%_0%,calc(12%_+_3px)_0%,3px_100%,0%_100%)]"
          style={{
            background: `linear-gradient(${BRAND.red}, ${BRAND.orange})`,
          }}
        />
      </div>
    </section>
  );
}
