import { Card, CardTitle, CardValue } from "@/components/ui/card";

import type { SalespersonRow } from "../../_data/mockData";

type SalespersonsStatsProps = {
  salespersons: SalespersonRow[];
};

export function SalespersonsStats({ salespersons }: SalespersonsStatsProps) {
  const total = salespersons.length;
  const pending = salespersons.filter(
    (salesperson) => salesperson.status === "pending",
  ).length;
  const approved = salespersons.filter(
    (salesperson) => salesperson.status === "approved",
  ).length;

  const stats = [
    { id: "total", label: "Total Salespersons", value: total },
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
