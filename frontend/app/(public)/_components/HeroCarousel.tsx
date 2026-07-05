"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import company from "@/content/company.json";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;

const SLIDES = ["/4.png", "/5.png", "/7.png","/6.png","/3.png","/2.png"];

export default function HeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, 4500);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {SLIDES.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={src}
            alt={COMPANY.brandLine}
            fill
            priority={i === 0}
            className="object-cover"
          />
        </div>
      ))}

      <div className="absolute bottom-6 right-6 z-10 flex gap-2">
        {SLIDES.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Show slide ${i + 1}`}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-6 bg-white" : "w-1.5 bg-white/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
