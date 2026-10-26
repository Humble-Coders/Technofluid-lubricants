import {
  BarChart3,
  BellRing,
  Boxes,
  Factory,
  LayoutDashboard,
  Package,
  ReceiptIndianRupee,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Who can use Technofluid Office, and which screens each role sees (PRD §2, 2026-10-09).
 *
 *  - admin      → everything
 *  - accounts   → sales, invoices, customers, payments, expenses, reports. No price edits,
 *                 no users, no manual stock adjustments.
 *  - supervisor → "Stock & Production" (supervisor + manufacturing merged): stock, production,
 *                 products WITHOUT prices. Never customers, prices, orders or invoices.
 *
 * This only decides what is SHOWN. The real gate is Firestore security rules and the
 * Cloud Functions, which check the role again on every read/write.
 */

export type OfficeRole = "admin" | "accounts" | "supervisor";

export const OFFICE_ROLES: readonly OfficeRole[] = ["admin", "accounts", "supervisor"];

export const ROLE_LABEL: Record<OfficeRole, string> = {
  admin: "Admin",
  accounts: "Accounts",
  supervisor: "Stock & Production",
};

export function isOfficeRole(role: unknown): role is OfficeRole {
  return typeof role === "string" && (OFFICE_ROLES as readonly string[]).includes(role);
}

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: readonly OfficeRole[];
  /** Section heading the item sits under in the sidebar. */
  group: "Overview" | "Sales" | "Stock" | "Money" | "Admin";
  /** Shortcut digit (Ctrl/⌘ + n). */
  shortcut?: string;
}

export const NAV: readonly NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "accounts", "supervisor"], group: "Overview", shortcut: "1" },

  { path: "/sales", label: "Sales & invoices", icon: ReceiptIndianRupee, roles: ["admin", "accounts"], group: "Sales", shortcut: "2" },
  { path: "/customers", label: "Customers & suppliers", icon: Users, roles: ["admin", "accounts"], group: "Sales", shortcut: "3" },
  { path: "/payments", label: "Payments", icon: Wallet, roles: ["admin", "accounts"], group: "Sales" },

  { path: "/products", label: "Products", icon: Package, roles: ["admin", "accounts", "supervisor"], group: "Stock", shortcut: "4" },
  { path: "/stock", label: "Stock", icon: Boxes, roles: ["admin", "accounts", "supervisor"], group: "Stock", shortcut: "5" },
  { path: "/production", label: "Production", icon: Factory, roles: ["admin", "supervisor"], group: "Stock" },

  { path: "/purchases", label: "Suppliers & purchases", icon: Truck, roles: ["admin", "accounts"], group: "Money" },
  { path: "/expenses", label: "Expenses", icon: ShoppingCart, roles: ["admin", "accounts"], group: "Money" },
  { path: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "accounts"], group: "Money", shortcut: "6" },

  { path: "/approvals", label: "Approvals", icon: BellRing, roles: ["admin"], group: "Admin" },
  { path: "/settings", label: "Settings", icon: Settings, roles: ["admin"], group: "Admin" },
];

export function navFor(role: OfficeRole): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canOpen(role: OfficeRole, path: string): boolean {
  const item = NAV.find((n) => (n.path === "/" ? path === "/" : path === n.path || path.startsWith(`${n.path}/`)));
  return item ? item.roles.includes(role) : false;
}

/** Stock & Production must never see money. Used by screens that would otherwise show prices. */
export function canSeePrices(role: OfficeRole): boolean {
  return role !== "supervisor";
}

/** Admin and Stock & Production record stock; Accounts only looks (PRD §2). The stock functions check again. */
export function canEditStock(role: OfficeRole): boolean {
  return role === "admin" || role === "supervisor";
}

/** Admin and Stock & Production may ask for a recipe change; only Admin approves (17 Oct 2026). */
export function canChangeRecipe(role: OfficeRole): boolean {
  return role === "admin" || role === "supervisor";
}

/** Only Admin changes products and prices (PRD §2). The editProduct Cloud Function checks again. */
export function canEditProducts(role: OfficeRole): boolean {
  return role === "admin";
}
