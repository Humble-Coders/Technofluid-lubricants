import { Card, CardTitle, CardValue } from "@/components/ui/card";

import type { SupervisorRow } from "../../_data/mockData";

type SupervisorsStatsProps = {
  supervisors: SupervisorRow[];
};

export function SupervisorsStats({ supervisors }: SupervisorsStatsProps) {
  const total = supervisors.length;
  const pending = supervisors.filter(
    (supervisor) => supervisor.status === "pending",
  ).length;
  const approved = supervisors.filter(
    (supervisor) => supervisor.status === "approved",
  ).length;

  const stats = [
    { id: "total", label: "Total Supervisors", value: total },
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
