// File: frontend/app/(public)/products/[slug]/_components/ProductGallery.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { BRAND } from "@/content/brand";
import type { ProductImages } from "@/types/content";

export default function ProductGallery({
  images,
  altBase,
}: {
  images: ProductImages;
  altBase: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = images.images[selectedIndex] ?? images.images[0];

  const selectedAlt = [altBase, selected.label, selected.packSize]
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border bg-white">
        <Image
          src={selected.src}
          alt={selectedAlt}
          fill
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
          className="object-contain p-6"
          priority
        />
      </div>

      {(selected.label || selected.packSize) && (
        <p className="text-center text-[12.5px] font-medium text-textSecondary">
          {selected.label}
          {selected.packSize ? ` — ${selected.packSize}` : ""}
        </p>
      )}

      {images.images.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2.5">
          {images.images.map((image, i) => {
            const isActive = i === selectedIndex;
            const thumbAlt = [altBase, image.label, image.packSize]
              .filter(Boolean)
              .join(" — ");
            return (
              <button
                key={image.src}
                type="button"
                onClick={() => setSelectedIndex(i)}
                aria-label={`Show image: ${thumbAlt}`}
                aria-pressed={isActive}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white transition-opacity"
                style={{
                  borderColor: isActive ? BRAND.orange : undefined,
                  borderWidth: isActive ? "2px" : "1px",
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                <Image
                  src={image.src}
                  alt={thumbAlt}
                  fill
                  sizes="64px"
                  className="object-contain p-1.5"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
