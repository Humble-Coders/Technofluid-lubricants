"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Industry } from "@/types/content";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? (
        <path d="M15 6l-6 6 6 6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}

export default function IndustriesCarousel({
  industries,
  renderCard,
}: {
  industries: Industry[];
  renderCard: (industry: Industry, index: number) => React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateArrows = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    setCanScrollPrev(node.scrollLeft > 4);
    setCanScrollNext(node.scrollLeft < node.scrollWidth - node.clientWidth - 4);
  }, []);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    updateArrows();
    node.addEventListener("scroll", updateArrows, { passive: true });
    const observer = new ResizeObserver(updateArrows);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", updateArrows);
      observer.disconnect();
    };
  }, [updateArrows, industries.length]);

  const scrollByCard = (direction: 1 | -1) => {
    const node = trackRef.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>("[data-carousel-card]");
    const step = card ? card.offsetWidth + 24 : node.clientWidth;
    node.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth py-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {industries.map((industry, index) => (
          <div
            key={industry.slug}
            data-carousel-card
            className="w-full shrink-0 snap-start sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
          >
            {renderCard(industry, index)}
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Previous industry"
        onClick={() => scrollByCard(-1)}
        disabled={!canScrollPrev}
        className="absolute -left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-textPrimary shadow-sm transition-all hover:scale-105 hover:shadow-md disabled:pointer-events-none disabled:opacity-0 sm:-left-6 lg:-left-12"
      >
        <ChevronIcon direction="left" />
      </button>

      <button
        type="button"
        aria-label="Next industry"
        onClick={() => scrollByCard(1)}
        disabled={!canScrollNext}
        className="absolute -right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-textPrimary shadow-sm transition-all hover:scale-105 hover:shadow-md disabled:pointer-events-none disabled:opacity-0 sm:-right-6 lg:-right-12"
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}
