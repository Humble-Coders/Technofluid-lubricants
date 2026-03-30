// File: frontend/app/(dashboard)/admin/supervisors/_components/SupervisorsTable.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { SupervisorRow } from "../../_data/mockData";
import { ApproveButton } from "./ApproveButton";

type SupervisorsTableProps = {
  supervisors: SupervisorRow[];
  onApprove: (id: string) => void;
  onEdit: (supervisor: SupervisorRow) => void;
  onDelete: (supervisor: SupervisorRow) => void;
};

export function SupervisorsTable({
  supervisors,
  onApprove,
  onEdit,
  onDelete,
}: SupervisorsTableProps) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Name</TH>
          <TH>Email</TH>
          <TH>Status</TH>
          <TH>Created At</TH>
          <TH>Action</TH>
        </tr>
      </TableHead>
      <TableBody>
        {supervisors.length === 0 ? (
          <tr>
            <td
              colSpan={5}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No records found.
            </td>
          </tr>
        ) : (
          supervisors.map((supervisor) => (
            <tr key={supervisor.id}>
              <TD>{supervisor.name}</TD>
              <TD>{supervisor.email}</TD>
              <TD>
                <Badge variant={supervisor.status}>{supervisor.status}</Badge>
              </TD>
              <TD>{supervisor.createdAt}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  {supervisor.status === "pending" && (
                    <ApproveButton onApprove={() => onApprove(supervisor.id)} />
                  )}
                  <Button
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                    onClick={() => onEdit(supervisor)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    className="h-9 px-3 text-xs"
                    onClick={() => onDelete(supervisor)}
                  >
                    Delete
                  </Button>
                </div>
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
