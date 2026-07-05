// File: frontend/app/(public)/industries/page.tsx
import industriesData from "@/content/industries.json";
import type { IndustriesContent } from "@/types/content";
import IndustriesHero from "./_components/IndustriesHero";
import IndustriesMarquee from "./_components/IndustriesMarquee";
import IndustriesShowcase from "./_components/IndustriesShowcase";

const DATA = industriesData as IndustriesContent;

export default function IndustriesIndexPage() {
  return (
    <>
      <IndustriesHero />
      <IndustriesMarquee industries={DATA.industries} />
      <IndustriesShowcase industries={DATA.industries} />
    </>
  );
}
