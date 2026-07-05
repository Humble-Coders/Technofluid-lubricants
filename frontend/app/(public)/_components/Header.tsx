"use client";

import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ASSETS } from "@/content/assets";
import { BRAND } from "@/content/brand";
import company from "@/content/company.json";
import type { CompanyContent } from "@/types/content";

const COMPANY = company as CompanyContent;

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Industries", href: "/industries" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

function isActiveLink(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center">
          <Image
            src={ASSETS.logoSrc}
            alt={COMPANY.brandLine}
            width={220}
            height={60}
            priority
            className="h-8 w-auto lg:h-9"
          />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isActiveLink(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  style={{ ["--nav-accent" as string]: BRAND.orange }}
                  className={`group relative inline-block py-1 text-[14px] transition-all duration-200 hover:scale-[1.08] hover:[color:var(--nav-accent)] ${
                    active
                      ? "font-semibold [color:var(--nav-accent)]"
                      : "text-textSecondary"
                  }`}
                >
                  {link.label}
                  <span
                    aria-hidden
                    className={`absolute -bottom-0.5 left-0 h-[2px] rounded-full transition-all duration-300 ease-out group-hover:w-full ${
                      active ? "w-full" : "w-0"
                    }`}
                    style={{ backgroundColor: BRAND.orange }}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden md:block">
          <Link
            href="/contact"
            style={
              {
                "--enquire-bg": BRAND.orange,
                "--enquire-hover-bg": BRAND.charcoal,
                "--enquire-hover-text": BRAND.orange,
              } as React.CSSProperties
            }
            className="inline-block rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all duration-200 [background-color:var(--enquire-bg)] hover:scale-105 hover:[background-color:var(--enquire-hover-bg)] hover:[color:var(--enquire-hover-text)]"
          >
            Enquire
          </Link>
        </div>

        <button
          onClick={() => setMenuOpen((p) => !p)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          className="relative flex h-9 w-9 flex-col items-center justify-center gap-[5px] md:hidden"
        >
          <span
            className={`block h-[1.5px] w-5 rounded-full bg-textPrimary transition-all duration-200 ${menuOpen ? "translate-y-[6.5px] rotate-45" : ""}`}
          />
          <span
            className={`block h-[1.5px] w-5 rounded-full bg-textPrimary transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`}
          />
          <span
            className={`block h-[1.5px] w-5 rounded-full bg-textPrimary transition-all duration-200 ${menuOpen ? "-translate-y-[6.5px] -rotate-45" : ""}`}
          />
        </button>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border bg-white md:hidden"
          >
            <ul className="flex flex-col gap-1 px-4 pb-2 pt-3">
              {NAV_LINKS.map((link) => {
                const active = isActiveLink(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      style={active ? { color: BRAND.orange, backgroundColor: `${BRAND.orange}0D` } : undefined}
                      className={`block rounded-xl px-4 py-3 text-[14.5px] transition-colors ${
                        active
                          ? "font-semibold"
                          : "text-textSecondary active:bg-black/[0.03]"
                      }`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 pb-5 pt-2">
              <Link
                href="/contact"
                style={{ backgroundColor: BRAND.orange }}
                className="block rounded-xl py-3 text-center text-[14px] font-semibold text-white shadow-sm"
                onClick={() => setMenuOpen(false)}
              >
                Enquire
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
