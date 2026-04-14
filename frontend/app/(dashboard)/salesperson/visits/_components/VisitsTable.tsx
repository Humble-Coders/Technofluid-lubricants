// File: frontend/app/(dashboard)/salesperson/visits/_components/VisitsTable.tsx
import { Timestamp } from "firebase/firestore";

import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { LogVisit } from "@/types/visit";

function formatDate(
  value: LogVisit["createdAt"] | LogVisit["updatedAt"],
): string {
  if (!value) return "-";
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : new Date(value as string | Date);
  return date.toLocaleDateString();
}

function formatLocation(location: LogVisit["location"]): string {
  if (!location) return "-";
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
}

function getStatusClass(status: LogVisit["status"]): string {
  switch (status) {
    case "submitted":
      return "bg-success/10 text-success";
    case "draft":
    default:
      return "bg-gray-100 text-gray-700";
  }
}

type VisitsTableProps = {
  visits: LogVisit[];
  loading?: boolean;
  onVisitClick?: (visitId: string) => void;
};

export function VisitsTable({
  visits,
  loading = false,
  onVisitClick,
}: VisitsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">Loading...</div>
    );
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Firm</TH>
          <TH>Status</TH>
          <TH>Location</TH>
          <TH>Media</TH>
          <TH>Priorities</TH>
          <TH>Related Firms</TH>
          <TH>Date</TH>
          <TH>Action</TH>
        </tr>
      </TableHead>
      <TableBody>
        {visits.length === 0 ? (
          <tr>
            <td
              colSpan={8}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No visits logged.
            </td>
          </tr>
        ) : (
          visits.map((visit) => (
            <tr
              key={visit.id}
              className={onVisitClick ? "cursor-pointer hover:bg-page/70" : ""}
              onClick={() => onVisitClick?.(visit.id)}
              onKeyDown={(event) => {
                if (!onVisitClick) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onVisitClick(visit.id);
                }
              }}
              tabIndex={onVisitClick ? 0 : -1}
              role={onVisitClick ? "button" : undefined}
            >
              <TD className="font-medium">{visit.firmName}</TD>
              <TD>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusClass(visit.status)}`}
                >
                  {visit.status}
                </span>
              </TD>
              <TD className="text-sm text-textSecondary">
                {formatLocation(visit.location)}
              </TD>
              <TD className="text-sm text-textSecondary">
                {visit.media.length}
              </TD>
              <TD className="text-sm text-textSecondary">
                {visit.priorities.monthly.length} monthly,{" "}
                {visit.priorities.annually.length} annual
              </TD>
              <TD className="text-sm text-textSecondary">
                {visit.relatedFirms.length}
              </TD>
              <TD className="text-sm text-textSecondary">
                {formatDate(visit.createdAt)}
              </TD>
              <TD className="text-right text-sm font-medium text-accent">
                {onVisitClick ? "View / Edit" : ""}
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
