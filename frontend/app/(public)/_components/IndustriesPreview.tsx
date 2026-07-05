"use client";

import Link from "next/link";
import { motion } from "motion/react";
import industriesData from "@/content/industries.json";
import { BRAND } from "@/content/brand";
import type { IndustriesContent } from "@/types/content";
import IndustriesCarousel from "./IndustriesCarousel";
import IndustryCard from "./IndustryCard";

const DATA = industriesData as IndustriesContent;
const PREVIEW = DATA.industries;
const TOTAL = DATA.summary.industries;

export default function IndustriesPreview() {
  return (
    <section className="bg-page py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-wrap items-end justify-between gap-6"
        >
          <div>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: BRAND.orange }}
            >
              Our Reach
            </p>
            <h2 className="mt-3 text-[1.9rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.2rem]">
              Industries We Serve
            </h2>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2">
            <span
              className="text-[1.1rem] font-extrabold leading-none"
              style={{ color: BRAND.orange }}
            >
              {TOTAL}
            </span>
            <span className="text-[12px] font-semibold text-textSecondary">
              industries served
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="mt-10"
        >
          <IndustriesCarousel
            industries={PREVIEW}
            renderCard={(industry, index) => (
              <IndustryCard industry={industry} index={index} />
            )}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mt-10 text-center"
        >
          <Link
            href="/industries"
            style={{ backgroundColor: BRAND.orange }}
            className="inline-block rounded-lg px-6 py-3 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            View all industries
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
