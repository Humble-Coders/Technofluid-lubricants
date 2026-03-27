"use client";

import { useAuth } from "@/lib/useAuth";
import { USER_ROLES } from "@/lib/constants";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { dashboardStats } from "@/app/(dashboard)/admin/_data/mockData";
import SalespersonDashboardPage from "@/app/(dashboard)/salesperson/page";

export default function DashboardPage() {
  const { userData } = useAuth();

  if (userData?.role === USER_ROLES.SALESPERSON) {
    return <SalespersonDashboardPage />;
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Card key={stat.id}>
            <CardTitle>{stat.label}</CardTitle>
            <CardValue>{stat.value}</CardValue>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Overview</CardTitle>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          This admin area is UI-first and powered by mock data. You can connect
          Firebase Auth, Firestore, and Cloud Functions later without changing
          the dashboard structure.
        </p>
      </Card>
    </section>
  );
}
