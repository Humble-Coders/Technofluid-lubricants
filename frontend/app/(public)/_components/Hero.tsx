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
        {/* Copy — left column */}
        <div className="relative z-10 flex w-full flex-col justify-center px-6 py-8 lg:w-1/3 lg:pl-8 lg:pr-10 lg:py-12 xl:pl-10">
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

          <motion.div
            className="relative w-full max-w-[360px]"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fadeUp}>
              <Image
                src="/logo-no_bg.png"
                alt={COMPANY.brandLine}
                width={810}
                height={246}
                priority
                className="h-auto w-full max-w-[250px] lg:max-w-[300px]"
              />
            </motion.div>

            {/* Brand rule — anchors the block and separates mark from copy */}
            <motion.div
              variants={fadeUp}
              aria-hidden
              className="mt-6 h-[3px] w-16 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.orange})`,
              }}
            />

            <motion.div
              variants={fadeUp}
              className="mt-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
              style={{ backgroundColor: `${BRAND.red}0F` }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: BRAND.red }}
              />
              <p
                className="whitespace-nowrap text-[12.5px] font-semibold"
                style={{ color: BRAND.red }}
              >
                {COMPANY.certification}
              </p>
            </motion.div>

            {/* Equal-width CTAs so the pair reads as one unit */}
            <motion.div
              variants={fadeUp}
              className="mt-7 grid grid-cols-2 gap-3"
            >
              <Link
                href="/products"
                style={{ backgroundColor: BRAND.orange }}
                className="rounded-xl px-4 py-3 text-center text-[13.5px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                Explore products
              </Link>
              <Link
                href="/contact"
                className="rounded-xl border border-border bg-white/70 px-4 py-3 text-center text-[13.5px] font-semibold text-textPrimary transition-colors hover:border-black/20 hover:bg-page"
              >
                Enquire
              </Link>
            </motion.div>

            {/* Credentials — one card, hairline split, so it reads as a unit.
                Type scales with each half (cqw) and never wraps. */}
            <motion.div
              variants={fadeUp}
              className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-white/70 shadow-sm backdrop-blur-sm"
            >
              <div className="@container px-4 py-3.5">
                <p
                  className="whitespace-nowrap font-extrabold leading-none"
                  style={{
                    color: BRAND.orange,
                    fontSize: "clamp(0.6rem, 13cqw, 1.3rem)",
                  }}
                >
                  Since {COMPANY.since}
                </p>
                <p
                  className="mt-1.5 whitespace-nowrap font-bold uppercase text-textSecondary"
                  style={{
                    fontSize: "clamp(0.32rem, 6cqw, 0.625rem)",
                    letterSpacing: "0.12em",
                  }}
                >
                  Powered by Experience
                </p>
              </div>
              <div className="@container border-l border-border px-4 py-3.5">
                <p
                  className="whitespace-nowrap font-extrabold leading-none"
                  style={{
                    color: BRAND.charcoal,
                    fontSize: "clamp(0.6rem, 13cqw, 1.3rem)",
                  }}
                >
                  ISO 9001:2015
                </p>
                <p
                  className="mt-1.5 whitespace-nowrap font-bold uppercase text-textSecondary"
                  style={{
                    fontSize: "clamp(0.32rem, 6cqw, 0.625rem)",
                    letterSpacing: "0.12em",
                  }}
                >
                  Certified Company
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Carousel — full-bleed right column, straight partition on desktop */}
        <div className="relative h-72 w-full sm:h-96 lg:h-auto lg:w-2/3">
          <HeroCarousel />
        </div>

        {/* Thin brand-colour seam along the straight cut */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[33.333%] hidden w-[3px] lg:block"
          style={{
            background: `linear-gradient(${BRAND.red}, ${BRAND.orange})`,
          }}
        />
      </div>
    </section>
  );
}
