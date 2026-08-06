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
            className="relative max-w-xl"
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
                className="h-auto w-full max-w-[260px] lg:max-w-[330px]"
              />
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
              style={{ backgroundColor: `${BRAND.red}0F` }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: BRAND.red }}
              />
              <p
                className="text-[12.5px] font-semibold"
                style={{ color: BRAND.red }}
              >
                {COMPANY.certification}
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link
                href="/products"
                style={{ backgroundColor: BRAND.orange }}
                className="rounded-lg px-7 py-3 text-center text-[13.5px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Explore products
              </Link>
              <Link
                href="/contact"
                className="rounded-lg border border-border bg-white/70 px-7 py-3 text-center text-[13.5px] font-semibold text-textPrimary transition-colors hover:bg-page"
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
                  ISO 9001:2015
                </p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-textPrimary sm:text-[10px] sm:tracking-[0.15em] lg:text-textSecondary">
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
