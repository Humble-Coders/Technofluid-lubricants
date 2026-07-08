"use client";

import { motion } from "motion/react";
import company from "@/content/company.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;

export default function WhoWeAre() {
  return (
    <section className="relative overflow-hidden bg-page py-20 lg:py-28">
      {/* Diagonal graphic bands */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.orange} 0 0)`,
          opacity: 0.05,
          clipPath: "polygon(0 20%, 45% 0, 60% 0, 15% 100%, 0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.red} 0 0)`,
          opacity: 0.04,
          clipPath: "polygon(70% 0, 85% 0, 40% 100%, 25% 100%)",
        }}
      />

      {/* Dot-grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-10 top-10 h-64 w-64 opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
          backgroundSize: "16px 16px",
        }}
      />

      {/* Large ghost year, bleeding off the right edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 bottom-0 select-none text-[11rem] font-black leading-none sm:text-[15rem]"
        style={{ color: `${BRAND.orange}1F` }}
      >
        {COMPANY.since}
      </span>

      {/* Bold colour wash, bottom-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-3xl"
        style={{
          background: `conic-gradient(from 40deg, ${BRAND.red} 0deg, ${BRAND.orange} 140deg, ${BRAND.peach} 250deg, transparent 340deg)`,
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        {/* "Powered by experience" since-badge */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mx-auto hidden aspect-square w-full max-w-[260px] items-center justify-center lg:flex"
        >
          {/* Concentric measurement rings, centred on this badge */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
          >
            <div
              className="h-[360px] w-[360px] rounded-full"
              style={{ border: `2px solid ${BRAND.orange}4D` }}
            />
            <div
              className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ border: `2px solid ${BRAND.red}5C` }}
            />
            <div
              className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ border: `2px dashed ${BRAND.peach}80` }}
            />
          </div>

          <div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-[0.14] blur-2xl"
            style={{
              background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 130deg, ${BRAND.peach} 240deg, transparent 340deg)`,
            }}
          />
          <div
            className="relative flex h-full w-full flex-col items-center justify-center rounded-full shadow-lg ring-4 ring-offset-4 ring-offset-page"
            style={{
              background: `linear-gradient(145deg, ${BRAND.orange}, ${BRAND.orangeDark})`,
              boxShadow: `0 12px 32px -8px ${BRAND.orange}66`,
              ["--tw-ring-color" as string]: `${BRAND.orange}33`,
            }}
          >
            {/* Inner highlight ring */}
            <div
              aria-hidden
              className="absolute inset-2 rounded-full border border-white/25"
            />

            <span className="relative text-[11px] font-bold uppercase tracking-[0.25em] text-white/80">
              Powered by Experience
            </span>
            <span className="relative mt-2 text-[3.1rem] font-extrabold leading-none text-white drop-shadow-sm">
              Since {COMPANY.since}
            </span>
            <span className="relative mt-3 h-[3px] w-10 rounded-full bg-white/90" />
          </div>
        </motion.div>

        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
        >
          {/* Eyebrow row — on mobile, pairs with an inline "Powered by Experience" stat replacing the circular badge above */}
          <div className="flex items-center justify-between gap-4 lg:block">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: BRAND.orange }}
            >
              Who We Are
            </p>

            <div className="flex items-baseline gap-1.5 lg:hidden">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-textSecondary">
                Est.
              </span>
              <span
                className="text-[16px] font-extrabold leading-none"
                style={{ color: BRAND.orange }}
              >
                {COMPANY.since}
              </span>
            </div>
          </div>

          <h2 className="mt-3 text-[1.9rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.2rem]">
            {COMPANY.brandLine}
          </h2>

          <p className="mt-5 max-w-2xl text-[15px] leading-[1.8] text-textSecondary">
            {COMPANY.about}
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: BRAND.orange }}
            />
            <span className="text-[12px] font-semibold text-textPrimary">
              A brand of {COMPANY.parentCompany}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
