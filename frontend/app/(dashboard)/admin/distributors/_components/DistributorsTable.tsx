// File: frontend/app/(dashboard)/admin/distributors/_components/DistributorsTable.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { DistributorRow } from "../../_data/mockData";

type DistributorsTableProps = {
  distributors: DistributorRow[];
  onApprove: (distributorId: string) => void;
};

export function DistributorsTable({
  distributors,
  onApprove,
}: DistributorsTableProps) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Name</TH>
          <TH>Created By</TH>
          <TH>Status</TH>
          <TH>Contact Info</TH>
          <TH>Action</TH>
        </tr>
      </TableHead>
      <TableBody>
        {distributors.length === 0 ? (
          <tr>
            <td
              colSpan={5}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No records found.
            </td>
          </tr>
        ) : (
          distributors.map((distributor) => (
            <tr key={distributor.id}>
              <TD>{distributor.name}</TD>
              <TD>{distributor.createdBy}</TD>
              <TD>
                <Badge variant={distributor.status}>{distributor.status}</Badge>
              </TD>
              <TD>{distributor.contactInfo}</TD>
              <TD>
                <Button
                  variant="secondary"
                  className="h-9 px-3"
                  onClick={() => onApprove(distributor.id)}
                  disabled={distributor.status === "approved"}
                >
                  {distributor.status === "approved" ? "Approved" : "Approve"}
                </Button>
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
