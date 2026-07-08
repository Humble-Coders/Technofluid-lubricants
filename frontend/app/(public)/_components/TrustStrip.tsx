"use client";

import { motion } from "motion/react";
import company from "@/content/company.json";
import industriesData from "@/content/industries.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent, IndustriesContent } from "@/types/content";

const COMPANY = company as CompanyContent;
const INDUSTRIES_COUNT = (industriesData as IndustriesContent).summary
  .industries;

// TODO: derive from docs/catalogue-2026.json once that catalogue is wired
// into the frontend (out of scope for this ticket) — ticket PUB1 allows
// hardcoding this fixed fact.
const PRODUCT_SERIES_COUNT = 36;

const STATS = [
  { value: `Since ${COMPANY.since}`, label: "Powered by Experience" },
  { value: COMPANY.certification, label: "Certified Quality" },
  { value: `${PRODUCT_SERIES_COUNT}`, label: "Product Series" },
  { value: `${INDUSTRIES_COUNT}`, label: "Types of Industries We Serve" },
];

export default function TrustStrip() {
  return (
    <section className="bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.1 }}
              className="group flex flex-col items-center justify-center gap-1.5 px-6 py-8 text-center transition-colors duration-300 hover:bg-[var(--brand-orange)]"
              style={{ ["--brand-orange" as string]: BRAND.orange }}
            >
              <span
                className="text-[1.4rem] font-extrabold leading-tight text-[var(--brand-orange)] transition-colors duration-300 group-hover:text-white sm:text-[1.6rem]"
              >
                {stat.value}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-textSecondary transition-colors duration-300 group-hover:text-white/90">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative mt-6 w-full overflow-hidden rounded-2xl bg-page p-6 text-center sm:p-8"
        >
          <div
            aria-hidden
            className="absolute -left-10 -top-10 h-28 w-28 rounded-full opacity-[0.12] blur-2xl"
            style={{
              background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
            }}
          />
          <p className="relative mx-auto max-w-2xl text-[14px] font-medium leading-relaxed text-textPrimary sm:text-[15px]">
            {COMPANY.ourCommitment}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
