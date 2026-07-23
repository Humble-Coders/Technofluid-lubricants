"use client";

import Link from "next/link";
import { motion } from "motion/react";
import company from "@/content/company.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;
const JOURNEY = COMPANY.journey;

export default function JourneyTeaser() {
  return (
    <section className="relative overflow-hidden bg-page py-16 lg:py-20">
      {/* Decorative geometric elements */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-[0.1] blur-2xl"
        style={{
          background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rotate-12 opacity-[0.06]"
        style={{
          background: BRAND.orange,
          clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-6 top-8 h-40 w-40 opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
          backgroundSize: "16px 16px",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end"
        >
          <div>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: BRAND.orange }}
            >
              Our History
            </p>
            <h2 className="mt-3 text-[1.6rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.1rem]">
              {JOURNEY.heading}
            </h2>
            <div
              className="mt-4 h-1 w-16 rounded-full"
              style={{ background: BRAND.orange }}
            />
          </div>
          <Link
            href="/about"
            className="group inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.12em] text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
            style={{ background: BRAND.orange }}
          >
            Read Our Story
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </Link>
        </motion.div>

        <div className="relative mt-12">
          {/* Connecting line — vertical on mobile, horizontal from sm up */}
          <div
            aria-hidden
            className="absolute left-[8px] top-1 bottom-1 w-px sm:left-0 sm:right-0 sm:top-[9px] sm:h-px sm:w-auto sm:bottom-auto"
            style={{
              background: `linear-gradient(to bottom, ${BRAND.red}, ${BRAND.orange}, ${BRAND.peach})`,
            }}
          />

          <ol className="flex flex-col gap-6 sm:grid sm:grid-cols-4 sm:gap-x-8 sm:gap-y-0">
            {JOURNEY.milestones.map((milestone, i) => {
              const accent = [BRAND.red, BRAND.orange, BRAND.peach][i % 3];
              return (
                <motion.li
                  key={milestone.year + milestone.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{
                    duration: 0.5,
                    ease: "easeOut",
                    delay: i * 0.1,
                  }}
                  className="group relative pl-7 sm:pl-0"
                >
                  <div
                    aria-hidden
                    className="absolute left-[8px] top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-4 border-page shadow-sm transition-transform duration-300 group-hover:scale-125 sm:static sm:h-[18px] sm:w-[18px] sm:translate-x-0"
                    style={{ background: accent }}
                  />
                  <span
                    className="block text-base font-extrabold sm:mt-4"
                    style={{ color: accent }}
                  >
                    {milestone.year}
                  </span>
                  <h3 className="mt-1 text-[13px] font-bold leading-snug text-textPrimary sm:text-sm">
                    {milestone.title}
                  </h3>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
