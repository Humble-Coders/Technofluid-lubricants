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

// Path per contact row, in order (Address, Phone, Email) — mirrors ContactScreen's icons.
const CONTACT_ICON_PATHS = [
  "M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  "M4 4.5c0-.6.4-1 1-1h2.7c.5 0 .9.3 1 .8l.7 3a1 1 0 0 1-.3 1L7.8 9.6a12 12 0 0 0 5.6 5.6l1.3-1.3a1 1 0 0 1 1-.3l3 .7c.5.1.8.5.8 1V18c0 .6-.4 1-1 1h-1C9.5 19 4 13.5 4 6.5v-1z",
  "M4 6h16v12H4V6z M4 6l8 7 8-7",
];

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
              {[ASSETS.contact.address, ASSETS.contact.phone, ASSETS.contact.email].map(
                (value, i) => (
                  <li key={value} className="flex items-start gap-2.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      fill="none"
                      stroke={BRAND.orange}
                      strokeWidth="1.8"
                    >
                      <path
                        d={CONTACT_ICON_PATHS[i]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{value}</span>
                  </li>
                ),
              )}
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
