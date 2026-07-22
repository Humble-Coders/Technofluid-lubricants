"use client";

import { motion } from "motion/react";
import { useSyncExternalStore } from "react";
import company from "@/content/company.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;

const CARD_ANIMATION_QUERY = "(min-width: 640px)";

function subscribeToCardAnimationQuery(callback: () => void) {
  const mq = window.matchMedia(CARD_ANIMATION_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getCardAnimationSnapshot() {
  return window.matchMedia(CARD_ANIMATION_QUERY).matches;
}

function getCardAnimationServerSnapshot() {
  return false;
}

// Card entrance animation is desktop/tablet only — disabled below the `sm`
// breakpoint, matching the grid-cols-2 switch, since it lagged on mobile.
function useCardAnimationEnabled() {
  return useSyncExternalStore(
    subscribeToCardAnimationQuery,
    getCardAnimationSnapshot,
    getCardAnimationServerSnapshot,
  );
}

export default function WhyChooseUs() {
  const cardAnimationEnabled = useCardAnimationEnabled();

  return (
    <section className="relative overflow-hidden bg-[#F6F7F8] pb-20 pt-10 lg:pb-28 lg:pt-14">
      {/* Decorative geometric elements */}
      <div
        aria-hidden
        className="absolute -left-32 -top-32 h-64 w-64 rotate-12 opacity-[0.09]"
        style={{
          background: BRAND.orange,
          clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
        }}
      />

      <div
        aria-hidden
        className="absolute -right-20 bottom-0 h-72 w-72 rotate-[18deg] opacity-[0.08]"
        style={{
          background: BRAND.orange,
          clipPath: "polygon(20% 0, 100% 0, 80% 100%, 0 100%)",
        }}
      />

      {/* Diagonal brand-colour band crossing the header area */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          background: `linear-gradient(${BRAND.red} 0 0)`,
          clipPath: "polygon(0 0, 18% 0, 6% 40%, 0 40%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          background: `linear-gradient(${BRAND.peach} 0 0)`,
          clipPath: "polygon(85% 0, 100% 0, 100% 55%, 92% 55%)",
        }}
      />

      {/* Dot-grid texture, top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 opacity-[0.18]"
        style={{
          backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
          backgroundSize: "16px 16px",
        }}
      />

      {/* Rotating ring accent behind the heading */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-6 top-6 h-40 w-40 transform-gpu rounded-full opacity-[0.22] blur-2xl lg:left-10"
        style={{
          background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Section Label */}
          <p
            className="text-[11px] font-bold uppercase tracking-[0.28em]"
            style={{ color: BRAND.orange }}
          >
            Our Strengths
          </p>

          {/* Heading */}
          <h2 className="mt-3 text-[1.8rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.4rem]">
            Why Choose Us
          </h2>

          {/* Intro sentence — a lead paragraph, not another heading */}
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-textSecondary sm:text-[16px]">
            {COMPANY.whyChooseUs.intro}
          </p>

          {/* Subtitle Line */}
          <div
            className="mt-5 h-1 w-20 rounded-full"
            style={{ background: BRAND.orange }}
          />
        </motion.div>

        {/* Cards */}
        <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANY.whyChooseUs.points.map((point, i) => (
            <motion.div
              key={point}
              initial={cardAnimationEnabled ? { opacity: 0, y: 24 } : false}
              whileInView={cardAnimationEnabled ? { opacity: 1, y: 0 } : undefined}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.1 }}
              className="
                group
                relative
                transform-gpu
                overflow-hidden
                rounded-3xl
                border
                border-border
                bg-white
                p-8
                transition-all
                duration-300
                hover:-translate-y-2
                hover:shadow-2xl
              "
            >
              {/* Left Accent Bar */}
              <div
                className="absolute left-0 top-0 h-full w-1.5"
                style={{
                  background: BRAND.orange,
                }}
              />

              {/* Decorative Shape */}
              <div
                className="
                  absolute
                  -right-10
                  -top-10
                  h-28
                  w-28
                  rotate-12
                  rounded-3xl
                  opacity-[0.04]
                "
                style={{
                  background: BRAND.orange,
                }}
              />

              {/* Icon */}
              <div
                className="
                  mb-6
                  flex
                  h-14
                  w-14
                  items-center
                  justify-center
                  rounded-2xl
                  border
                "
                style={{
                  backgroundColor: `${BRAND.orange}10`,
                  borderColor: `${BRAND.orange}30`,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  stroke={BRAND.orange}
                  strokeWidth="2"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Small Label */}
              <p
                className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em]"
                style={{
                  color: BRAND.orange,
                }}
              >
                TechnoFluid Advantage
              </p>

              {/* Content */}
              <h3 className="text-lg font-bold leading-snug text-textPrimary">
                {point}
              </h3>

              {/* Bottom Accent */}
              <div
                className="
                  mt-8
                  h-[2px]
                  w-12
                  rounded-full
                  transition-all
                  duration-300
                  group-hover:w-20
                "
                style={{
                  background: BRAND.orange,
                }}
              />
            </motion.div>
          ))}
        </div>

        {/* Quote Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative mt-6 w-full overflow-hidden rounded-[2rem] border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          {/* Background Number */}
          <span className="absolute right-4 top-0 text-[80px] font-black leading-none text-black/[0.03]">
            &rdquo;
          </span>

          {/* Accent Bar */}
          <div
            className="absolute left-0 top-0 h-full w-1.5"
            style={{
              background: BRAND.orange,
            }}
          />

          <div className="relative sm:overflow-x-auto">
            <p className="whitespace-normal text-[14px] font-medium italic leading-relaxed text-textPrimary sm:whitespace-nowrap sm:text-[16px] lg:text-[18px]">
              &ldquo;{COMPANY.whyChooseUs.closing}&rdquo;
            </p>
          </div>

          <div
            className="mt-3 h-1 w-16 rounded-full"
            style={{
              background: BRAND.orange,
            }}
          />
        </motion.div>
      </div>
    </section>
  );
}