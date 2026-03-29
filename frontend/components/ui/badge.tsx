// File: frontend/components/ui/badge.tsx
import type { ReactNode } from "react";

type BadgeVariant =
  | "pending"
  | "approved"
  | "rejected"
  | "active"
  | "inactive"
  | "processing"
  | "success"
  | "danger"
  | "info"
  | "secondary";

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
};

const badgeStyles: Record<BadgeVariant, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
  active: "bg-success/15 text-success",
  inactive: "bg-textSecondary/15 text-textSecondary",
  processing: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  secondary: "bg-textSecondary/15 text-textSecondary",
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
