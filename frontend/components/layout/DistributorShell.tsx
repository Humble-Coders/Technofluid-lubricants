// File: frontend/components/layout/DistributorShell.tsx
"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { DistributorSidebar } from "@/components/layout/DistributorSidebar";
import { Topbar } from "@/components/layout/Topbar";

const titleMap: Record<string, string> = {
  "/distributor": "Dashboard",
  "/distributor/place-order": "Place Order",
  "/distributor/orders": "My Orders",
  "/distributor/rate-list": "Rate List",
};

export function DistributorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = titleMap[pathname] ?? "Distributor";
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div
      className="flex min-h-screen bg-page"
      style={{
        ["--admin-sidebar-width" as string]: isSidebarCollapsed
          ? "5rem"
          : "16rem",
      }}
    >
      <DistributorSidebar isCollapsed={isSidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
