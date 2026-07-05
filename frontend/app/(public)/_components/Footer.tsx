import Link from "next/link";
import Image from "next/image";
import company from "@/content/company.json";
import industriesData from "@/content/industries.json";
import { ASSETS } from "@/content/assets";
import { PRODUCT_CATEGORIES } from "@/content/productCategories";
import { BRAND } from "@/content/brand";
import type { CompanyContent, IndustriesContent } from "@/types/content";

const COMPANY = company as CompanyContent;
const INDUSTRIES = (industriesData as IndustriesContent).industries;
const FEATURED_INDUSTRIES = INDUSTRIES.slice(0, 6);

export default function Footer() {
  return (
    <footer className="border-t border-border bg-page">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          {/* Company blurb + tagline */}
          <div>
            <Image
              src={ASSETS.logoSrc}
              alt={COMPANY.brandLine}
              width={220}
              height={60}
              className="h-9 w-auto"
            />
            <p className="mt-3 text-[13px] text-textSecondary">
              {COMPANY.brandLine}
            </p>
            <p className="mt-3 text-[13px] font-medium italic text-textSecondary">
              {COMPANY.tagline}
            </p>
          </div>

          {/* Product categories */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-textSecondary">
              Product Categories
            </h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_CATEGORIES.map((category) => (
                <li key={category.href}>
                  <Link
                    href={category.href}
                    className="text-[13px] text-textSecondary transition-colors hover:text-textPrimary"
                  >
                    {category.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Industries */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-textSecondary">
              Industries
            </h3>
            <ul className="mt-4 space-y-2.5">
              {FEATURED_INDUSTRIES.map((industry) => (
                <li key={industry.slug}>
                  <Link
                    href={`/industries/${industry.slug}`}
                    className="text-[13px] text-textSecondary transition-colors hover:text-textPrimary"
                  >
                    {industry.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/industries"
                  style={{ color: BRAND.orange }}
                  className="text-[13px] font-semibold transition-opacity hover:opacity-80"
                >
                  View all industries
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-textSecondary">
              Contact
            </h3>
            <ul className="mt-4 space-y-2.5 text-[13px] text-textSecondary">
              <li>{ASSETS.contact.address}</li>
              <li>{ASSETS.contact.phone}</li>
              <li>{ASSETS.contact.email}</li>
            </ul>
          </div>
        </div>

        {/* Trust line */}
        <div className="mt-12 border-t border-border pt-6">
          <p className="text-[12px] text-textSecondary">
            A brand of {COMPANY.parentCompany} · {COMPANY.certification} ·
            Since {COMPANY.since}
          </p>
        </div>
      </div>
    </footer>
  );
}
