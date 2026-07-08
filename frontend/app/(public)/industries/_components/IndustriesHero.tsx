"use client";

import Image from "next/image";
import { motion } from "motion/react";
import company from "@/content/company.json";
import industriesData from "@/content/industries.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent, IndustriesContent } from "@/types/content";

const COMPANY = company as CompanyContent;
const SUMMARY = (industriesData as IndustriesContent).summary;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

export default function IndustriesHero() {
  return (
    <section className="relative overflow-hidden border-b border-border py-20 lg:py-28">
      {/* Background image */}
      <Image
        src="/products-hero.png"
        alt=""
        fill
        priority
        className="object-cover"
      />

      {/* Dark overlay for text contrast */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `conic-gradient(from -30deg, ${BRAND.red}55 0deg, ${BRAND.orange}33 120deg, transparent 260deg)`,
          mixBlendMode: "multiply",
        }}
      />

      <motion.div
        className="relative mx-auto max-w-5xl px-6 lg:px-8"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.p
          variants={fadeUp}
          className="text-[11px] font-bold uppercase tracking-[0.28em]"
          style={{ color: BRAND.peach }}
        >
          Our Reach
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="mt-3 max-w-2xl text-[2.1rem] font-extrabold leading-tight tracking-tight text-white sm:text-[2.8rem]"
        >
          Industries We Serve
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75"
        >
          From steel and mining to pharma and marine, {SUMMARY.industries}{" "}
          industries rely on Technofluid lubricants suited to their exact
          duty — filter by sector or search below to find yours.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p
              className="text-[1.3rem] font-extrabold leading-none"
              style={{ color: BRAND.peach }}
            >
              {SUMMARY.industries}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
              Types of Industries We Serve
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p
              className="text-[1.3rem] font-extrabold leading-none"
              style={{ color: BRAND.peach }}
            >
              {SUMMARY.linkedToSeries}+
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
              Lubricant Types
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p
              className="text-[1.3rem] font-extrabold leading-none"
              style={{ color: BRAND.peach }}
            >
              Since {COMPANY.since}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
              Powered by Experience
            </p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
