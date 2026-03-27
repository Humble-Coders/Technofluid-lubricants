import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { Distributor } from "@/types/distributor";

type DistributorsTableProps = {
  distributors: Distributor[];
  loading?: boolean;
};

export function DistributorsTable({
  distributors,
  loading = false,
}: DistributorsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">Loading...</div>
    );
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Name</TH>
          <TH>Email</TH>
          <TH>Phone</TH>
          <TH>Status</TH>
          <TH>Address</TH>
        </tr>
      </TableHead>
      <TableBody>
        {distributors.length === 0 ? (
          <tr>
            <td
              colSpan={5}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No distributors found.
            </td>
          </tr>
        ) : (
          distributors.map((distributor) => (
            <tr key={distributor.uid}>
              <TD className="font-medium">{distributor.name}</TD>
              <TD>{distributor.email || "-"}</TD>
              <TD>{distributor.phone || "-"}</TD>
              <TD>
                <Badge variant={distributor.status}>{distributor.status}</Badge>
              </TD>
              <TD>{distributor.address || "-"}</TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
