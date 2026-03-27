"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import SalespersonVisitsPage from "@/app/(dashboard)/salesperson/visits/page";

export default function DashboardVisitsPage() {
  const { userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userData?.role !== USER_ROLES.SALESPERSON) {
      router.replace("/dashboard");
    }
  }, [userData, loading, router]);

  if (loading || userData?.role !== USER_ROLES.SALESPERSON) return null;
  return <SalespersonVisitsPage />;
}
