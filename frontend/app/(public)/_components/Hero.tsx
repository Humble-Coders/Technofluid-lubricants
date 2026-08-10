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

          {/* Masthead — sized to its own content (not stretched to the
              column), centred in the available space by the parent's
              justify-center. Head at the top, ruled credentials ledger,
              action bars at the foot, all hung off one hairline spine that
              runs only the height of this block. */}
          <motion.div
            className="relative flex w-full max-w-[420px] flex-col"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {/* Spine — single alignment edge for every band */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 hidden w-px lg:block"
              style={{
                background: `linear-gradient(180deg, ${BRAND.red}, ${BRAND.orange} 22%, ${BRAND.peach} 48%, transparent)`,
              }}
            />

            {/* Head — mark only. (The certification line duplicated the
                "ISO 9001:2015 / Certified Company" row already in the
                ledger below, so it's dropped here rather than repeated.) */}
            <motion.div variants={fadeUp} className="lg:pl-7">
              <Image
                src="/logo-no_bg.png"
                alt={COMPANY.brandLine}
                width={810}
                height={246}
                priority
                className="h-auto w-full max-w-[270px] xl:max-w-[310px]"
              />
            </motion.div>

            {/* Credentials ledger — sized to its own content */}
            <motion.div variants={fadeUp} className="mt-9 flex flex-col">
              <div className="@container border-t border-border py-5 lg:pl-7">
                <p
                  className="whitespace-nowrap font-extrabold leading-none"
                  style={{
                    color: BRAND.orange,
                    fontSize: "clamp(1.1rem, 12cqw, 1.85rem)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Since {COMPANY.since}
                </p>
                <p
                  className="mt-2 whitespace-nowrap font-bold uppercase text-textSecondary"
                  style={{
                    fontSize: "clamp(0.45rem, 3.6cqw, 0.7rem)",
                    letterSpacing: "0.16em",
                  }}
                >
                  Powered by Experience
                </p>
              </div>
              <div className="@container border-y border-border py-5 lg:pl-7">
                <p
                  className="whitespace-nowrap font-extrabold leading-none"
                  style={{
                    color: BRAND.charcoal,
                    fontSize: "clamp(1.1rem, 12cqw, 1.85rem)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  ISO 9001:2015
                </p>
                <p
                  className="mt-2 whitespace-nowrap font-bold uppercase text-textSecondary"
                  style={{
                    fontSize: "clamp(0.45rem, 3.6cqw, 0.7rem)",
                    letterSpacing: "0.16em",
                  }}
                >
                  Certified Company
                </p>
              </div>
            </motion.div>

            {/* Actions — full-measure bars, so the foot is as wide as the head */}
            <motion.div
              variants={fadeUp}
              className="mt-9 flex flex-col gap-3 lg:pl-7"
            >
              <Link
                href="/products"
                className="group flex items-center justify-between gap-3 rounded-lg px-5 py-4 text-[12px] font-bold uppercase tracking-[0.12em] text-white shadow-sm transition-all duration-200 hover:brightness-95 xl:text-[12.5px]"
                style={{ backgroundColor: BRAND.red }}
              >
                <span className="whitespace-nowrap">Explore products</span>
                <span
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
              <Link
                href="/contact"
                className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-5 py-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-textPrimary transition-colors duration-200 hover:border-textPrimary xl:text-[12.5px]"
              >
                <span className="whitespace-nowrap">Enquire</span>
                <span
                  aria-hidden
                  className="text-textSecondary transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
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
