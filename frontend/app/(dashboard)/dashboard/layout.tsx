"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/layout/AdminShell";
import { SalespersonShell } from "@/components/layout/SalespersonShell";
import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !userData || !userData.isActive || userData.status !== "approved") {
      router.push("/login");
    }
  }, [user, userData, loading, router]);

  if (loading || !user || !userData || !userData.isActive || userData.status !== "approved") {
    return (
      <div className="flex h-screen items-center justify-center">
        Checking access...
      </div>
    );
  }

  if (userData.role === USER_ROLES.ADMIN) {
    return <AdminShell>{children}</AdminShell>;
  }

  return <SalespersonShell>{children}</SalespersonShell>;
}
