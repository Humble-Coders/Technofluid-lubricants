// File: frontend/app/(dashboard)/admin/page.tsx
import { Card, CardTitle, CardValue } from "@/components/ui/card";

import { dashboardStats } from "./_data/mockData";

export default function AdminDashboardPage() {
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
