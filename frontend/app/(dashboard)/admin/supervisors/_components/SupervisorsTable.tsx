import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { SupervisorRow } from "../../_data/mockData";
import { ApproveButton } from "./ApproveButton";

type SupervisorsTableProps = {
  supervisors: SupervisorRow[];
  onApprove: (id: string) => void;
};

export function SupervisorsTable({
  supervisors,
  onApprove,
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
                {supervisor.status === "pending" ? (
                  <ApproveButton onApprove={() => onApprove(supervisor.id)} />
                ) : (
                  <span className="text-xs font-medium text-textSecondary">
                    Approved
                  </span>
                )}
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
