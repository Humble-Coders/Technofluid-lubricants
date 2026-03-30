// File: frontend/app/(dashboard)/admin/salespersons/_components/SalespersonsTable.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { SalespersonRow } from "../../_data/mockData";
import { ApproveButton } from "./ApproveButton";

type SalespersonsTableProps = {
  salespersons: SalespersonRow[];
  onApprove: (id: string) => void;
  onEdit: (salesperson: SalespersonRow) => void;
  onDelete: (salesperson: SalespersonRow) => void;
};

export function SalespersonsTable({
  salespersons,
  onApprove,
  onEdit,
  onDelete,
}: SalespersonsTableProps) {
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
        {salespersons.length === 0 ? (
          <tr>
            <td
              colSpan={5}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No records found.
            </td>
          </tr>
        ) : (
          salespersons.map((salesperson) => (
            <tr key={salesperson.id}>
              <TD>{salesperson.name}</TD>
              <TD>{salesperson.email}</TD>
              <TD>
                <Badge variant={salesperson.status}>{salesperson.status}</Badge>
              </TD>
              <TD>{salesperson.createdAt}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  {salesperson.status === "pending" && (
                    <ApproveButton onApprove={() => onApprove(salesperson.id)} />
                  )}
                  <Button
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                    onClick={() => onEdit(salesperson)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    className="h-9 px-3 text-xs"
                    onClick={() => onDelete(salesperson)}
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
