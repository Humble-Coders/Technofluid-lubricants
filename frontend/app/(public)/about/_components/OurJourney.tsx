"use client";

import { motion } from "motion/react";
import company from "@/content/company.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;
const JOURNEY = COMPANY.journey;

// One icon per milestone, in order: founding, second generation, brand
// launch, current chapter. Falls back by cycling if more milestones are added.
const MILESTONE_ICON_PATHS = [
  // Flag — the beginning
  "M5 21V4 M5 4h13l-3 4 3 4H5",
  // Person with upward arrow — second generation, growth
  "M9 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M4.5 20c.5-4 2.3-6.5 4.5-6.5s4 2.5 4.5 6.5 M17 14l3-3 3 3 M20 11v8",
  // Star burst — brand launch
  "M12 3l2.2 5.6L20 10l-4.6 3.6L16.6 20 12 16.6 7.4 20l1.2-6.4L4 10l5.8-1.4L12 3z",
  // Globe — today, international reach
  "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M4 12h16 M12 4c2.2 2.2 3.2 5 3.2 8s-1 5.8-3.2 8c-2.2-2.2-3.2-5-3.2-8s1-5.8 3.2-8z",
];

export default function OurJourney() {
  return (
    <section className="relative overflow-hidden bg-white py-16 lg:py-24">
      {/* Decorative geometric elements */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 top-10 h-72 w-72 -rotate-12 opacity-[0.06]"
        style={{
          background: BRAND.orange,
          clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-10 h-56 w-56 rotate-[24deg] opacity-[0.06]"
        style={{
          background: BRAND.peach,
          clipPath: "polygon(20% 0, 100% 0, 80% 100%, 0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 top-1/3 h-52 w-52 opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
          backgroundSize: "18px 18px",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p
            className="text-[11px] font-bold uppercase tracking-[0.28em]"
            style={{ color: BRAND.orange }}
          >
            Our History
          </p>
          <h2 className="mt-3 text-[1.8rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.4rem]">
            {JOURNEY.heading}
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-textSecondary sm:text-[16px]">
            {JOURNEY.intro}
          </p>
          <div
            className="mt-5 h-1 w-20 rounded-full"
            style={{ background: BRAND.orange }}
          />
        </motion.div>

        <div className="relative mt-12">
          <div
            aria-hidden
            className="absolute left-[7px] top-2 bottom-2 w-px sm:left-1/2 sm:-translate-x-1/2"
            style={{
              background: `linear-gradient(to bottom, ${BRAND.red}, ${BRAND.orange}, ${BRAND.peach})`,
            }}
          />

          <ol className="space-y-10 sm:space-y-14">
            {JOURNEY.milestones.map((milestone, i) => {
              const alignRight = i % 2 === 1;
              const accent = [BRAND.red, BRAND.orange, BRAND.peach][i % 3];
              return (
                <motion.li
                  key={milestone.year + milestone.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{
                    duration: 0.5,
                    ease: "easeOut",
                    delay: i * 0.1,
                  }}
                  className="relative pl-8 sm:grid sm:grid-cols-2 sm:gap-10 sm:pl-0"
                >
                  {/* Glow halo behind the marker */}
                  <div
                    aria-hidden
                    className="absolute left-0 top-1 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-md sm:left-1/2"
                    style={{ background: accent }}
                  />
                  <div
                    aria-hidden
                    className="absolute left-0 top-1 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white shadow sm:left-1/2"
                    style={{ background: accent }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.2"
                    >
                      <path
                        d={MILESTONE_ICON_PATHS[i % MILESTONE_ICON_PATHS.length]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Faint rotated accent shape behind the card, alternating sides */}
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute top-1/2 hidden h-24 w-24 -translate-y-1/2 rotate-45 rounded-2xl opacity-[0.06] sm:block ${
                      alignRight ? "left-[calc(50%+2rem)]" : "right-[calc(50%+2rem)]"
                    }`}
                    style={{ background: accent }}
                  />

                  <div
                    className={
                      alignRight
                        ? "sm:col-start-2 sm:text-left"
                        : "sm:col-start-1 sm:row-start-1 sm:text-right"
                    }
                  >
                    <span
                      className="text-lg font-extrabold"
                      style={{ color: accent }}
                    >
                      {milestone.year}
                    </span>
                    <h3 className="mt-1 text-base font-bold text-textPrimary">
                      {milestone.title}
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-textSecondary sm:text-[15px]">
                      {milestone.text}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative mt-14 w-full overflow-hidden rounded-2xl border border-border bg-page p-6 text-center sm:p-8"
        >
          <div
            aria-hidden
            className="absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.12] blur-2xl"
            style={{
              background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
            }}
          />
          <p className="relative mx-auto max-w-2xl text-[14px] font-medium leading-relaxed text-textPrimary sm:text-[15px]">
            {JOURNEY.closing}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
