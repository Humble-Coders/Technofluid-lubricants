import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { OrderRow, OrderStatus } from "../../_data/mockData";

type OrdersTableProps = {
  orders: OrderRow[];
  onStatusChange: (orderId: string, value: OrderStatus) => void;
};

export function OrdersTable({ orders, onStatusChange }: OrdersTableProps) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Distributor Name</TH>
          <TH>Items Summary</TH>
          <TH>Total Qty</TH>
          <TH>Total Amount</TH>
          <TH>Status</TH>
          <TH>Created At</TH>
          <TH>Update Status</TH>
        </tr>
      </TableHead>
      <TableBody>
        {orders.length === 0 ? (
          <tr>
            <td
              colSpan={7}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No records found.
            </td>
          </tr>
        ) : (
          orders.map((order) => (
            <tr key={order.id}>
              <TD>{order.distributorName}</TD>
              <TD>{order.itemsSummary}</TD>
              <TD>{order.totalQty}</TD>
              <TD>${order.totalAmount.toLocaleString()}</TD>
              <TD>
                <Badge variant={order.status}>{order.status}</Badge>
              </TD>
              <TD>{order.createdAt}</TD>
              <TD>
                <Select
                  id={`status-${order.id}`}
                  label=""
                  className="min-w-35"
                  options={[
                    { label: "Pending", value: "pending" },
                    { label: "Processing", value: "processing" },
                    { label: "Approved", value: "approved" },
                  ]}
                  value={order.status}
                  onChange={(event) =>
                    onStatusChange(order.id, event.target.value as OrderStatus)
                  }
                />
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
