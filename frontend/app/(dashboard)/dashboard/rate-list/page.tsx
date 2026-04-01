// File: frontend/app/(dashboard)/dashboard/rate-list/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import AdminRateListPage from "@/app/(dashboard)/admin/rate-list/page";

export default function DashboardRateListPage() {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userData?.role !== USER_ROLES.ADMIN) {
      router.replace("/dashboard");
    }
  }, [userData, loading, router]);

  if (loading || userData?.role !== USER_ROLES.ADMIN) return null;
  return <AdminRateListPage />;
}
