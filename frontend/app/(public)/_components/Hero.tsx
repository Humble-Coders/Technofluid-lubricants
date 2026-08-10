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
            className="relative w-full max-w-[380px]"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {/* Soft brand glow behind the card */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-5 rounded-[40px] opacity-[0.18] blur-2xl"
              style={{
                background: `linear-gradient(140deg, ${BRAND.red}, ${BRAND.orange} 55%, transparent)`,
              }}
            />

            <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/75 p-7 shadow-[0_24px_70px_-30px_rgba(43,43,43,0.45)] backdrop-blur-xl lg:p-8">
              {/* Gradient hairline across the top edge */}
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{
                  background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.orange}, transparent)`,
                }}
              />

              <motion.div variants={fadeUp}>
                <Image
                  src="/logo-no_bg.png"
                  alt={COMPANY.brandLine}
                  width={810}
                  height={246}
                  priority
                  className="h-auto w-full max-w-[240px] lg:max-w-[270px]"
                />
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="mt-6 inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3.5 ring-1"
                style={{
                  backgroundColor: `${BRAND.red}0D`,
                  color: BRAND.red,
                  ["--tw-ring-color" as string]: `${BRAND.red}26`,
                }}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: BRAND.red }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-2.5 w-2.5"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                    aria-hidden
                  >
                    <path
                      d="M4 12.5 9.5 18 20 6.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="whitespace-nowrap text-[12.5px] font-semibold">
                  {COMPANY.certification}
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-7 flex flex-col gap-2.5">
                <Link
                  href="/products"
                  className="group flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[13.5px] font-bold text-white transition-all hover:-translate-y-0.5"
                  style={{
                    background: `linear-gradient(120deg, ${BRAND.red}, ${BRAND.orange})`,
                    boxShadow: `0 10px 24px -12px ${BRAND.orange}`,
                  }}
                >
                  Explore products
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </Link>
                <Link
                  href="/contact"
                  className="rounded-xl border border-border bg-white/80 px-5 py-3.5 text-center text-[13.5px] font-semibold text-textPrimary transition-colors hover:border-black/20 hover:bg-page"
                >
                  Enquire
                </Link>
              </motion.div>

              {/* Credentials — hairline-split pair. Type scales with each half
                  (cqw) so it never wraps as the panel narrows. */}
              <motion.div
                variants={fadeUp}
                className="mt-7 grid grid-cols-2 border-t border-border pt-5"
              >
                <div className="@container pr-4">
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
                <div className="@container border-l border-border pl-4">
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
            </div>
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
