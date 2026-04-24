// File: frontend/components/layout/Sidebar.tsx
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
    href: "/dashboard/supervisors",
    label: "Supervisors",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/salespersons",
    label: "Salespersons",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3z" />
        <path d="M8 12c2.2 0 4-1.8 4-4S10.2 4 8 4 4 5.8 4 8s1.8 4 4 4z" />
        <path d="M3 20c1.2-3.1 3.9-5 7-5" />
        <path d="M13 20c.8-2.3 2.8-3.8 5-4" />
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
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 4h18" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="6" width="18" height="15" rx="2" />
        <path d="M8 11h8" />
        <path d="M8 15h5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/coupons",
    label: "Coupons",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 7h16v10H4z" />
        <path d="M12 7v10" />
        <circle cx="8" cy="12" r="1" />
        <circle cx="16" cy="12" r="1" />
      </svg>
    ),
  },
  {
    href: "/dashboard/rate-list",
    label: "Rate List",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

type SidebarProps = {
  isCollapsed: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export function Sidebar({
  isCollapsed,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
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

  const closeMobile = () => {
    onCloseMobile?.();
  };

  const renderNav = (collapsed: boolean, mobile = false) => (
    <>
      <div className={`mb-6 ${collapsed ? "px-2" : "px-3"}`}>
        <p
          className={`font-bold tracking-tight text-textPrimary ${
            collapsed ? "text-base" : "text-xl"
          }`}
        >
          {collapsed ? "TL" : "Technofluid Lubricants"}
        </p>
        {!collapsed ? (
          <p className="mt-1 text-xs uppercase tracking-wider text-textSecondary">
            Admin Panel
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
              onClick={mobile ? closeMobile : undefined}
              className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-textSecondary hover:bg-page hover:text-textPrimary"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed ? <span className="ml-3">{item.label}</span> : null}
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
          {!collapsed ? <span className="ml-3">Logout</span> : null}
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside
        className="hidden h-full shrink-0 border-r border-border bg-surface p-3 transition-all duration-200 lg:block"
        style={{ width: "var(--admin-sidebar-width, 16rem)" }}
      >
        <div className="flex h-full flex-col">{renderNav(isCollapsed)}</div>
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-black/35 transition-opacity lg:hidden ${
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[20rem] border-r border-border bg-surface p-3 transition-transform duration-200 lg:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex h-full flex-col">{renderNav(false, true)}</div>
      </aside>
    </>
  );
}
