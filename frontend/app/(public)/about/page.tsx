// File: frontend/app/(public)/about/page.tsx
import company from "@/content/company.json";
import { BRAND } from "@/content/brand";
import type { CompanyContent } from "@/types/content";
import OurJourney from "./_components/OurJourney";
import WhyChooseUs from "../_components/WhyChooseUs";

const COMPANY = company as CompanyContent;

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-page py-16 lg:py-24">
        {/* Decorative geometric elements */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rotate-12 opacity-[0.08]"
          style={{
            background: BRAND.orange,
            clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rotate-[18deg] opacity-[0.07]"
          style={{
            background: BRAND.red,
            clipPath: "polygon(20% 0, 100% 0, 80% 100%, 0 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-[0.15]"
          style={{
            backgroundImage: `radial-gradient(${BRAND.orange} 1.5px, transparent 1.5px)`,
            backgroundSize: "16px 16px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-10 top-10 h-40 w-40 transform-gpu rounded-full opacity-[0.18] blur-2xl"
          style={{
            background: `conic-gradient(from 20deg, ${BRAND.red} 0deg, ${BRAND.orange} 150deg, ${BRAND.peach} 260deg, transparent 340deg)`,
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center lg:px-8">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.28em]"
            style={{ color: BRAND.orange }}
          >
            About Us
          </p>
          <h1 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.6rem]">
            {COMPANY.brandLine}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-textSecondary sm:text-[16px]">
            {COMPANY.about}
          </p>
        </div>
      </section>

      <OurJourney />

      <WhyChooseUs />
    </>
  );
}
