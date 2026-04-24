// File: frontend/components/layout/AdminShell.tsx
"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/supervisors": "Supervisors",
  "/dashboard/salespersons": "Salespersons",
  "/dashboard/distributors": "Distributors",
  "/dashboard/orders": "Orders",
  "/dashboard/visits": "Visits",
  "/dashboard/coupons": "Coupons",
  "/admin/settings": "Settings",
};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = titleMap[pathname] ?? "Admin";
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleToggleSidebar = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setIsMobileSidebarOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => !prev);
  };

  return (
    <div
      className="flex h-screen overflow-hidden bg-page"
      style={{
        ["--admin-sidebar-width" as string]: isSidebarCollapsed
          ? "5rem"
          : "16rem",
      }}
    >
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
