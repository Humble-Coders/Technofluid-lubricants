"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { SalespersonSidebar } from "@/components/layout/SalespersonSidebar";
import { Topbar } from "@/components/layout/Topbar";

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/distributors": "Distributors",
  "/dashboard/orders": "Orders",
  "/dashboard/visits": "Visits",
};

export function SalespersonShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = titleMap[pathname] ?? "Salesperson";
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
      <SalespersonSidebar isCollapsed={isSidebarCollapsed} />
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
