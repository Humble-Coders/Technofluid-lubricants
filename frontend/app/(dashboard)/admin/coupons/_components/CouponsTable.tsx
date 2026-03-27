import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { CouponRow } from "../../_data/mockData";

type CouponsTableProps = {
  coupons: CouponRow[];
};

export function CouponsTable({ coupons }: CouponsTableProps) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Code</TH>
          <TH>Type</TH>
          <TH>Audience</TH>
          <TH>Discount</TH>
          <TH>Status</TH>
          <TH>Valid Till</TH>
        </tr>
      </TableHead>
      <TableBody>
        {coupons.map((coupon) => (
          <tr key={coupon.id}>
            <TD>{coupon.code}</TD>
            <TD>
              <span className="capitalize">{coupon.type}</span>
            </TD>
            <TD>
              {coupon.type === "targeted" && coupon.targetRole ? (
                <span className="text-sm text-textPrimary">
                  {coupon.targetRole === "salesperson"
                    ? "Salesperson"
                    : "Distributor"}
                  {coupon.targetNames?.length
                    ? ` (${coupon.targetNames.length})`
                    : ""}
                </span>
              ) : (
                <span className="text-sm text-textSecondary">All users</span>
              )}
            </TD>
            <TD>{coupon.discount}</TD>
            <TD>
              <Badge variant={coupon.status}>{coupon.status}</Badge>
            </TD>
            <TD>{coupon.validTill}</TD>
          </tr>
        ))}
      </TableBody>
    </Table>
  );
}
