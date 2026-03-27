"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import AdminSalespersonsPage from "@/app/(dashboard)/admin/salespersons/page";

export default function DashboardSalespersonsPage() {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userData?.role !== USER_ROLES.ADMIN) {
      router.replace("/dashboard");
    }
  }, [userData, loading, router]);

  if (loading || userData?.role !== USER_ROLES.ADMIN) return null;
  return <AdminSalespersonsPage />;
}
