// File: frontend/app/(public)/_components/ComingSoon.tsx
// Themed fallback for public routes that are linked (nav/footer) but not
// built yet. Swap out for the real page content when it's ready.
import Link from "next/link";
import { BRAND } from "@/content/brand";

export default function ComingSoon({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 py-24 text-center lg:px-8">
      <span
        className="text-[11px] font-bold uppercase tracking-[0.28em]"
        style={{ color: BRAND.orange }}
      >
        {eyebrow}
      </span>
      <h1 className="mt-4 text-[2.2rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.8rem]">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-textSecondary">
        {description}
      </p>
      <Link
        href="/"
        style={{ backgroundColor: BRAND.orange }}
        className="mt-10 inline-block rounded-lg px-6 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </section>
  );
}
