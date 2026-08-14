// File: frontend/app/(public)/products/_components/ProductSearchBar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ProductSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  function handleChange(next: string) {
    setValue(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) {
        params.set("q", next.trim());
      } else {
        params.delete("q");
      }
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `/products?${qs}` : "/products");
    }, 300);
  }

  return (
    <div className="mx-auto mb-8 max-w-md px-6 lg:px-8">
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-textSecondary"
        >
          🔍
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full rounded-full border border-border bg-white py-2.5 pl-10 pr-4 text-[14px] text-textPrimary placeholder:text-textSecondary focus:border-black/20 focus:outline-none"
        />
      </div>
    </div>
  );
}
