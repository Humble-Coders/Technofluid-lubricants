// File: frontend/app/(public)/products/_components/ProductsPagination.tsx
import Link from "next/link";
import { BRAND } from "@/content/brand";

function pageHref(activeSlug: string | null, page: number): string {
  const params = new URLSearchParams();
  if (activeSlug) params.set("category", activeSlug);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default function ProductsPagination({
  activeSlug,
  page,
  totalPages,
}: {
  activeSlug: string | null;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav
      aria-label="Products pagination"
      className="mt-12 flex items-center justify-center gap-2"
    >
      <Link
        href={pageHref(activeSlug, page - 1)}
        aria-disabled={page <= 1}
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors ${
          page <= 1
            ? "pointer-events-none border-border text-textSecondary/40"
            : "border-border text-textSecondary hover:border-black/20"
        }`}
      >
        <span aria-hidden>←</span>
      </Link>

      {pages.map((p) => {
        const isActive = p === page;
        return (
          <Link
            key={p}
            href={pageHref(activeSlug, p)}
            aria-current={isActive ? "page" : undefined}
            style={isActive ? { backgroundColor: BRAND.orange, color: "white" } : undefined}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
              isActive
                ? ""
                : "border border-border text-textSecondary hover:border-black/20"
            }`}
          >
            {p}
          </Link>
        );
      })}

      <Link
        href={pageHref(activeSlug, page + 1)}
        aria-disabled={page >= totalPages}
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors ${
          page >= totalPages
            ? "pointer-events-none border-border text-textSecondary/40"
            : "border-border text-textSecondary hover:border-black/20"
        }`}
      >
        <span aria-hidden>→</span>
      </Link>
    </nav>
  );
}
