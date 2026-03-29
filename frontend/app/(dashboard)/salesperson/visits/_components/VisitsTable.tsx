// File: frontend/app/(dashboard)/salesperson/visits/_components/VisitsTable.tsx
import { Timestamp } from "firebase/firestore";

import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { Visit } from "@/types/visit";

function formatDate(value: Visit["nextFollowUp"] | Visit["createdAt"]): string {
  if (!value) return "-";
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : new Date(value as string | Date);
  return date.toLocaleDateString();
}

type VisitsTableProps = {
  visits: Visit[];
  loading?: boolean;
};

export function VisitsTable({ visits, loading = false }: VisitsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">Loading...</div>
    );
  }

  const getLeadTypeColor = (leadType: string) => {
    switch (leadType) {
      case "hot":
        return "bg-red-100 text-red-700";
      case "warm":
        return "bg-yellow-100 text-yellow-700";
      case "cold":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Distributor</TH>
          <TH>Lead Type</TH>
          <TH>Notes</TH>
          <TH>Follow Up</TH>
          <TH>Date</TH>
        </tr>
      </TableHead>
      <TableBody>
        {visits.length === 0 ? (
          <tr>
            <td
              colSpan={5}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No visits logged.
            </td>
          </tr>
        ) : (
          visits.map((visit) => (
            <tr key={visit.id}>
              <TD className="font-medium">{visit.distributorName}</TD>
              <TD>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${getLeadTypeColor(visit.leadType)}`}
                >
                  {visit.leadType}
                </span>
              </TD>
              <TD className="text-sm text-textSecondary max-w-xs truncate">
                {visit.notes}
              </TD>
              <TD className="text-sm text-textSecondary">
                {formatDate(visit.nextFollowUp)}
              </TD>
              <TD className="text-sm text-textSecondary">
                {formatDate(visit.createdAt)}
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
