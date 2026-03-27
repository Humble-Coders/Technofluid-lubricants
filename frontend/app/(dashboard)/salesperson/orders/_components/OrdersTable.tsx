import { Timestamp } from "firebase/firestore";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { Order } from "@/types/order";

function formatDate(value: Order["createdAt"]): string {
  if (!value) return "-";
  const date = value instanceof Timestamp ? value.toDate() : new Date(value as string | Date);
  return date.toLocaleDateString();
}

type OrdersTableProps = {
  orders: Order[];
  loading?: boolean;
};

export function OrdersTable({ orders, loading = false }: OrdersTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">Loading...</div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "secondary";
      case "approved":
        return "success";
      case "rejected":
        return "danger";
      case "dispatched":
        return "info";
      case "delivered":
        return "success";
      default:
        return "secondary";
    }
  };

  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Distributor</TH>
          <TH>Items</TH>
          <TH>Qty</TH>
          <TH>Amount</TH>
          <TH>Status</TH>
          <TH>Date</TH>
        </tr>
      </TableHead>
      <TableBody>
        {orders.length === 0 ? (
          <tr>
            <td
              colSpan={6}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No orders found.
            </td>
          </tr>
        ) : (
          orders.map((order) => (
            <tr key={order.id}>
              <TD className="font-medium">{order.distributorName}</TD>
              <TD className="text-sm text-textSecondary">
                {order.itemsSummary}
              </TD>
              <TD>{order.totalQty}</TD>
              <TD className="font-medium">
                ${order.totalAmount.toLocaleString()}
              </TD>
              <TD>
                <Badge variant={getStatusColor(order.status)}>
                  {order.status}
                </Badge>
              </TD>
              <TD className="text-sm text-textSecondary">
                {formatDate(order.createdAt)}
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
