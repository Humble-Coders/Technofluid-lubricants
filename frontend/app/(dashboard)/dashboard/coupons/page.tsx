// File: frontend/app/(dashboard)/dashboard/coupons/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import AdminCouponsPage from "@/app/(dashboard)/admin/coupons/page";

export default function DashboardCouponsPage() {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userData?.role !== USER_ROLES.ADMIN) {
      router.replace("/dashboard");
    }
  }, [userData, loading, router]);

  if (loading || userData?.role !== USER_ROLES.ADMIN) return null;
  return <AdminCouponsPage />;
}
