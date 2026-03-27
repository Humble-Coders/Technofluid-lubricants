"use client";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import AdminOrdersPage from "@/app/(dashboard)/admin/orders/page";
import SalespersonOrdersPage from "@/app/(dashboard)/salesperson/orders/page";

export default function DashboardOrdersPage() {
  const { userData } = useAuth();

  if (userData?.role === USER_ROLES.ADMIN) return <AdminOrdersPage />;
  return <SalespersonOrdersPage />;
}
