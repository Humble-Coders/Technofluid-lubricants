"use client";

import Link from "next/link";
import { motion } from "motion/react";
import company from "@/content/company.json";
import { ASSETS } from "@/content/assets";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;

const CONTACT_ITEMS = [
  {
    label: "Address",
    value: ASSETS.contact.address,
    icon: (
      <path
        d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z M12 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Phone",
    value: ASSETS.contact.phone,
    icon: (
      <path
        d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.8 2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Email",
    value: ASSETS.contact.email,
    icon: (
      <path
        d="M4 4h16v16H4V4Zm0 0 8 8 8-8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export default function ContactCta() {
  return (
    <section
      className="relative flex min-h-screen flex-col overflow-hidden py-16 lg:py-20"
      style={{
        background: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.orange})`,
      }}
    >
      {/* Diagonal graphic bands */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.peach} 0 0)`,
          opacity: 0.1,
          clipPath: "polygon(0 20%, 45% 0, 60% 0, 15% 100%, 0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${BRAND.charcoal} 0 0)`,
          opacity: 0.08,
          clipPath: "polygon(70% 0, 85% 0, 40% 100%, 25% 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(rgba(255,255,255,0.9) 0 0)",
          opacity: 0.06,
          clipPath: "polygon(100% 0, 100% 35%, 55% 100%, 42% 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.12] blur-2xl"
        style={{ background: BRAND.peach }}
      />

      {/* Giant watermark tagline, purely decorative */}
      <p
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap text-center text-[10vw] font-black leading-none text-white/[0.06]"
      >
        TECHNOFLUID
      </p>

      <div className="relative flex flex-1 flex-col justify-between">
        {/* Top row */}
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 lg:px-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">
            {COMPANY.brandLine}
          </span>
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.28em] text-white/70 sm:block">
            {COMPANY.certification}
          </span>
        </div>

        {/* Middle — headline + CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-3xl px-6 text-center lg:px-8"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">
            Get In Touch
          </p>
          <h2 className="mt-4 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-[3.6rem]">
            Ready to cut the friction?
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/80">
            {COMPANY.tagline}
          </p>

          <div className="mt-10">
            <Link
              href="/contact"
              className="inline-block rounded-lg bg-white px-9 py-4 text-[14px] font-bold shadow-sm transition-opacity hover:opacity-90"
              style={{ color: BRAND.red }}
            >
              Enquire Now
            </Link>
          </div>
        </motion.div>

        {/* Bottom — contact details */}
        <div className="mx-auto w-full max-w-4xl px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 border-t border-white/20 pt-8 sm:grid-cols-3">
            {CONTACT_ITEMS.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.1 }}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-6 backdrop-blur-sm transition-colors duration-300 hover:border-white hover:bg-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-white transition-colors duration-300 group-hover:text-[var(--hover-icon)]"
                  style={{ ["--hover-icon" as string]: BRAND.orange }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  {item.icon}
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 transition-colors duration-300 group-hover:text-textSecondary">
                  {item.label}
                </span>
                <span
                  className="text-[13px] font-medium text-white transition-colors duration-300 group-hover:text-[var(--hover-text)]"
                  style={{ ["--hover-text" as string]: BRAND.red }}
                >
                  {item.value}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
