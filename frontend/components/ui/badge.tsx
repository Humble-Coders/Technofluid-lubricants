import type { ReactNode } from "react";

type BadgeVariant =
  | "pending"
  | "approved"
  | "active"
  | "inactive"
  | "processing";

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
};

const badgeStyles: Record<BadgeVariant, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  active: "bg-success/15 text-success",
  inactive: "bg-textSecondary/15 text-textSecondary",
  processing: "bg-accent/15 text-accent",
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${badgeStyles[variant]}`}
    >
      {children}
    </span>
  );
}
