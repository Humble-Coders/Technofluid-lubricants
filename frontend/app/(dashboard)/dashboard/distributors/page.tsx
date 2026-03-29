// File: frontend/app/(dashboard)/dashboard/distributors/page.tsx
"use client";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import AdminDistributorsPage from "@/app/(dashboard)/admin/distributors/page";
import SalespersonDistributorsPage from "@/app/(dashboard)/salesperson/distributors/page";

export default function DashboardDistributorsPage() {
  const { userData } = useAuth();

  if (userData?.role === USER_ROLES.ADMIN) return <AdminDistributorsPage />;
  return <SalespersonDistributorsPage />;
}
