// File: frontend/app/(public)/page.tsx
import Hero from "./_components/Hero";
import WhoWeAre from "./_components/WhoWeAre";
import ProductCategories from "./_components/ProductCategories";
import IndustriesPreview from "./_components/IndustriesPreview";
import WhyChooseUs from "./_components/WhyChooseUs";
import TrustStrip from "./_components/TrustStrip";
import JourneyTeaser from "./_components/JourneyTeaser";
import ContactCta from "./_components/ContactCta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <WhoWeAre />
      <JourneyTeaser />
      <ProductCategories />
      <IndustriesPreview />
      <WhyChooseUs />
      <TrustStrip />
      <ContactCta />
    </>
  );
}
