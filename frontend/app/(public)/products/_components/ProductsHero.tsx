// File: frontend/app/(public)/products/_components/ProductsHero.tsx
import { BRAND } from "@/content/brand";

export default function ProductsHero() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center lg:px-8 lg:py-20">
      <span
        className="text-[11px] font-bold uppercase tracking-[0.28em]"
        style={{ color: BRAND.orange }}
      >
        Products
      </span>
      <h1 className="mt-4 text-[2.2rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.8rem]">
        Our full lubricant catalogue
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-textSecondary">
        Industrial oils, automotive lubricants, greases and specialty oils —
        browse what we make, in the pack sizes we actually sell.
      </p>
    </section>
  );
}
