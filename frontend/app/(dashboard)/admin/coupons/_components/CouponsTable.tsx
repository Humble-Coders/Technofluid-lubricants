// File: frontend/app/(dashboard)/admin/coupons/_components/CouponsTable.tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TD, TH, TableHead } from "@/components/ui/table";

import type { CouponRow } from "../../_data/mockData";

const today = new Date().toISOString().split("T")[0];

function formatDiscount(coupon: CouponRow): string {
  return coupon.discountType === "percentage"
    ? `${coupon.discountValue}%`
    : `$${coupon.discountValue}`;
}

function formatUsage(coupon: CouponRow): string {
  if (coupon.usageLimit === 0) {
    return `${coupon.usageCount} / ∞`;
  }
  return `${coupon.usageCount} / ${coupon.usageLimit}`;
}

function isExpired(validTill: string): boolean {
  return !!validTill && validTill < today;
}

type CouponsTableProps = {
  coupons: CouponRow[];
  loading?: boolean;
};

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-border" />
        </td>
      ))}
    </tr>
  );
}

export function CouponsTable({ coupons, loading = false }: CouponsTableProps) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TH>Code</TH>
          <TH>Type</TH>
          <TH>Audience</TH>
          <TH>Discount</TH>
          <TH>Usage</TH>
          <TH>Status</TH>
          <TH>Valid Till</TH>
        </tr>
      </TableHead>
      <TableBody>
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : coupons.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-textPrimary">
                No coupons found
              </p>
              <p className="mt-1 text-xs text-textSecondary">
                Try adjusting your filters or create a new coupon.
              </p>
            </td>
          </tr>
        ) : (
          coupons.map((coupon) => {
            const expired = isExpired(coupon.validTill);
            return (
              <tr key={coupon.id}>
                <TD>
                  <span className="font-mono font-semibold tracking-wide">
                    {coupon.code}
                  </span>
                </TD>
                <TD>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      coupon.type === "targeted"
                        ? "bg-accent/10 text-accent"
                        : "bg-textSecondary/10 text-textSecondary"
                    }`}
                  >
                    {coupon.type}
                  </span>
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
                <TD>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    {formatDiscount(coupon)}
                    <span className="text-xs font-normal text-textSecondary">
                      {coupon.discountType === "percentage" ? "off" : "flat"}
                    </span>
                  </span>
                </TD>
                <TD>
                  <span
                    className={`text-sm ${
                      coupon.usageLimit > 0 &&
                      coupon.usageCount >= coupon.usageLimit
                        ? "font-medium text-danger"
                        : "text-textSecondary"
                    }`}
                  >
                    {formatUsage(coupon)}
                  </span>
                </TD>
                <TD>
                  <Badge variant={coupon.status}>{coupon.status}</Badge>
                </TD>
                <TD>
                  <span
                    className={`text-sm ${
                      expired ? "font-medium text-danger" : "text-textPrimary"
                    }`}
                  >
                    {coupon.validTill}
                    {expired && (
                      <span className="ml-1.5 text-xs font-normal">
                        (expired)
                      </span>
                    )}
                  </span>
                </TD>
              </tr>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
