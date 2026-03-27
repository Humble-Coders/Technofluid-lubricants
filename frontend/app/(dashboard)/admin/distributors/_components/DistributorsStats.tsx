import { Card, CardTitle, CardValue } from "@/components/ui/card";

import type { DistributorRow } from "../../_data/mockData";

type DistributorsStatsProps = {
  distributors: DistributorRow[];
};

export function DistributorsStats({ distributors }: DistributorsStatsProps) {
  const total = distributors.length;
  const pending = distributors.filter(
    (distributor) => distributor.status === "pending",
  ).length;
  const approved = distributors.filter(
    (distributor) => distributor.status === "approved",
  ).length;

  const stats = [
    { id: "total", label: "Total Distributors", value: total },
    { id: "pending", label: "Pending", value: pending },
    { id: "approved", label: "Approved", value: approved },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.id} className="p-4">
          <CardTitle>{stat.label}</CardTitle>
          <CardValue>{stat.value}</CardValue>
        </Card>
      ))}
    </div>
  );
}
