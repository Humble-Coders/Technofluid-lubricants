// File: frontend/app/not-found.tsx
// Global 404 fallback, themed to match the rest of the site instead of
// Next.js's default unstyled error page.
import Link from "next/link";
import Image from "next/image";
import { ASSETS } from "@/content/assets";
import { BRAND } from "@/content/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-page px-6 py-24 text-center">
      <Image
        src={ASSETS.logoSrc}
        alt="Technofluid Lubricants"
        width={200}
        height={54}
        className="h-9 w-auto"
      />
      <span
        className="mt-10 text-[11px] font-bold uppercase tracking-[0.28em]"
        style={{ color: BRAND.orange }}
      >
        404
      </span>
      <h1 className="mt-4 text-[2.2rem] font-extrabold leading-tight tracking-tight text-textPrimary sm:text-[2.8rem]">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-textSecondary">
        The page you&apos;re looking for may have been moved or isn&apos;t
        built yet.
      </p>
      <Link
        href="/"
        style={{ backgroundColor: BRAND.orange }}
        className="mt-10 inline-block rounded-lg px-6 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}
