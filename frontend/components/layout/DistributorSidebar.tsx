// File: frontend/components/layout/DistributorSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";

const navItems = [
  {
    href: "/distributor",
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
    href: "/distributor/place-order",
    label: "Place Order",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    href: "/distributor/orders",
    label: "My Orders",
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
    href: "/distributor/rate-list",
    label: "Rate List",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

type DistributorSidebarProps = {
  isCollapsed: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export function DistributorSidebar({
  isCollapsed,
  isMobileOpen = false,
  onCloseMobile,
}: DistributorSidebarProps) {
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
            Distributor
          </p>
        ) : null}
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/distributor"
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
        aria-label="Distributor navigation"
      >
        <div className="flex h-full flex-col">{renderNav(false, true)}</div>
      </aside>
    </>
  );
}
