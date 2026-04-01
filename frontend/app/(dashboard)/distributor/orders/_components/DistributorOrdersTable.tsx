// File: frontend/app/(dashboard)/distributor/orders/_components/DistributorOrdersTable.tsx
import { Timestamp } from "firebase/firestore";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";
import type { Order } from "@/types/order";

function formatDate(value: Order["createdAt"]): string {
  if (!value) return "-";
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : new Date(value as string | Date);
  return date.toLocaleDateString();
}

type DistributorOrdersTableProps = {
  orders: Order[];
  loading?: boolean;
};

function getStatusVariant(status: string) {
  switch (status) {
    case "pending":
      return "pending" as const;
    case "approved":
      return "approved" as const;
    case "rejected":
      return "danger" as const;
    case "dispatched":
      return "info" as const;
    case "delivered":
      return "success" as const;
    default:
      return "secondary" as const;
  }
}

export function DistributorOrdersTable({
  orders,
  loading = false,
}: DistributorOrdersTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">Loading...</div>
    );
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Order ID</TH>
          <TH>Date</TH>
          <TH>Items</TH>
          <TH>Qty</TH>
          <TH>Amount</TH>
          <TH>Coupon</TH>
          <TH>Status</TH>
        </tr>
      </TableHead>
      <TableBody>
        {orders.length === 0 ? (
          <tr>
            <td
              colSpan={7}
              className="px-4 py-8 text-center text-sm text-textSecondary"
            >
              No orders found.
            </td>
          </tr>
        ) : (
          orders.map((order) => (
            <tr key={order.id}>
              <TD className="font-mono text-xs text-textSecondary">
                {order.id.slice(0, 8)}…
              </TD>
              <TD className="text-sm text-textSecondary">
                {formatDate(order.createdAt)}
              </TD>
              <TD className="text-sm text-textSecondary">{order.itemsSummary}</TD>
              <TD>{order.totalQty}</TD>
              <TD className="font-medium">
                <span>${order.totalAmount.toLocaleString()}</span>
                {order.discount && order.discount > 0 ? (
                  <span className="ml-1 text-xs text-success">
                    (-${order.discount})
                  </span>
                ) : null}
              </TD>
              <TD>
                {order.couponCode ? (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {order.couponCode}
                  </span>
                ) : (
                  <span className="text-textSecondary">—</span>
                )}
              </TD>
              <TD>
                <Badge variant={getStatusVariant(order.status)}>
                  {order.status}
                </Badge>
              </TD>
            </tr>
          ))
        )}
      </TableBody>
    </Table>
  );
}
