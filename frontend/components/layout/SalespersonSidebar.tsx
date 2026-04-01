// File: frontend/components/layout/SalespersonSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 13h8V3H3z" />
        <path d="M13 21h8V11h-8z" />
        <path d="M13 3h8v6h-8z" />
        <path d="M3 21h8v-6H3z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/distributors",
    label: "Distributors",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="8" width="18" height="10" rx="2" />
        <path d="M7 8V6h10v2" />
      </svg>
    ),
  },
  {
    href: "/dashboard/orders",
    label: "Orders",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M15 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/visits",
    label: "Visits",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
];

type SalespersonSidebarProps = {
  isCollapsed: boolean;
};

export function SalespersonSidebar({ isCollapsed }: SalespersonSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  return (
    <aside
      className="hidden h-screen shrink-0 border-r border-border bg-surface p-3 transition-all duration-200 lg:block"
      style={{ width: "var(--admin-sidebar-width, 16rem)" }}
    >
      <div className="flex h-full flex-col">
        <div className={`mb-6 ${isCollapsed ? "px-2" : "px-3"}`}>
          <p
            className={`font-bold tracking-tight text-textPrimary ${
              isCollapsed ? "text-base" : "text-xl"
            }`}
          >
            {isCollapsed ? "HS" : "Humble Solutions"}
          </p>
          {!isCollapsed ? (
            <p className="mt-1 text-xs uppercase tracking-wider text-textSecondary">
              Salesperson
            </p>
          ) : null}
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-textSecondary hover:bg-page hover:text-textPrimary"
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {!isCollapsed ? (
                  <span className="ml-3">{item.label}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-textSecondary transition hover:bg-page hover:text-textPrimary"
          >
            <span className="shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </span>
            {!isCollapsed ? <span className="ml-3">Logout</span> : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
