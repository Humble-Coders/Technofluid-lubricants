// File: frontend/app/(dashboard)/admin/coupons/_components/CouponsStats.tsx
import { Card, CardTitle, CardValue } from "@/components/ui/card";

import type { CouponRow } from "../../_data/mockData";

export function CouponsStats({ coupons }: { coupons: CouponRow[] }) {
  const today = new Date().toISOString().split("T")[0];
  const total = coupons.length;
  const active = coupons.filter((c) => c.status === "active").length;
  const inactive = coupons.filter((c) => c.status === "inactive").length;
  const expired = coupons.filter(
    (c) => c.validTill && c.validTill < today,
  ).length;

  const stats = [
    { id: "total", label: "Total Coupons", value: total },
    { id: "active", label: "Active", value: active },
    { id: "inactive", label: "Inactive", value: inactive },
    { id: "expired", label: "Expired", value: expired },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.id} className="p-4">
          <CardTitle>{stat.label}</CardTitle>
          <CardValue>{stat.value}</CardValue>
        </Card>
      ))}
    </div>
  );
}
