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

          {/* Masthead — the block spans the column's full height so the copy
              reads as a letterhead hung off one hairline spine, not a card
              floating in space. Head at the top, ruled credentials ledger
              absorbing the middle, action bars at the foot. */}
          <motion.div
            className="relative flex w-full max-w-[420px] flex-col gap-9 lg:h-full lg:max-w-none lg:justify-between lg:gap-0"
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

            {/* Head — mark, rule, certification */}
            <motion.div variants={fadeUp} className="@container lg:pl-7">
              <Image
                src="/logo-no_bg.png"
                alt={COMPANY.brandLine}
                width={810}
                height={246}
                priority
                className="h-auto w-full max-w-[270px] xl:max-w-[310px]"
              />
              <div
                aria-hidden
                className="mt-6 h-px w-full"
                style={{
                  background: `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.peach}, transparent)`,
                }}
              />
              {/* Allowed to wrap — only the credential lines below must not.
                  Keeping it one line here would force it to micro-type. */}
              <p
                className="mt-4 text-[11.5px] font-bold uppercase leading-relaxed xl:text-[12.5px]"
                style={{ color: BRAND.red, letterSpacing: "0.16em" }}
              >
                {COMPANY.certification}
              </p>
            </motion.div>

            {/* Credentials ledger — takes the middle of the column so the
                leftover height belongs to one deliberate band instead of
                becoming dead air above and below the content. */}
            <motion.div
              variants={fadeUp}
              className="flex flex-col lg:my-8 lg:flex-1 lg:justify-center"
            >
              <div className="@container flex flex-col justify-center border-t border-border py-5 lg:min-h-[104px] lg:flex-1 lg:py-6 lg:pl-7">
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
              <div className="@container flex flex-col justify-center border-y border-border py-5 lg:min-h-[104px] lg:flex-1 lg:py-6 lg:pl-7">
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
              className="flex flex-col gap-3 lg:pl-7"
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
