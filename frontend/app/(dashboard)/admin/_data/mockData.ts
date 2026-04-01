// File: frontend/app/(dashboard)/admin/_data/mockData.ts
export type ApprovalStatus = "pending" | "approved";
export type OrderStatus = "pending" | "processing" | "approved";
export type CouponType = "global" | "targeted";
export type CouponStatus = "active" | "inactive";
export type CouponTargetRole = "salesperson" | "distributor";

export type DashboardStat = {
  id: string;
  label: string;
  value: string;
};

export type StaffRow = {
  id: string;
  autoId?: string;
  name: string;
  phone?: string;
  email: string;
  address?: string;
  status: ApprovalStatus;
  createdAt: string;
};

export type SupervisorRow = StaffRow;
export type SalespersonRow = StaffRow;

export type DistributorRow = {
  id: string;
  autoId?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  createdBy: string;
  status: ApprovalStatus;
  contactInfo: string;
};

export type OrderRow = {
  id: string;
  distributorName: string;
  itemsSummary: string;
  totalQty: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
};

export type CouponRow = {
  id: string;
  code: string;
  type: CouponType;
  targetRole?: CouponTargetRole;
  targetNames?: string[];
  discountType: "percentage" | "flat";
  discountValue: number;
  usageLimit: number; // 0 = unlimited
  usageCount: number;
  status: CouponStatus;
  validTill: string;
};

export const dashboardStats: DashboardStat[] = [
  { id: "orders", label: "Total Orders", value: "1,248" },
  { id: "distributors", label: "Total Distributors", value: "74" },
  { id: "approvals", label: "Pending Approvals", value: "18" },
  { id: "revenue", label: "Revenue", value: "$142,500" },
];

export const supervisorsSeed: SupervisorRow[] = [
  {
    id: "s1",
    name: "Priya Menon",
    email: "priya.supervisor@lubeflow.com",
    status: "pending",
    createdAt: "2026-03-19",
  },
  {
    id: "s2",
    name: "Daniel Cruz",
    email: "daniel.supervisor@lubeflow.com",
    status: "approved",
    createdAt: "2026-03-14",
  },
  {
    id: "s3",
    name: "Lina Zhang",
    email: "lina.supervisor@lubeflow.com",
    status: "pending",
    createdAt: "2026-03-22",
  },
];

export const salespersonsSeed: SalespersonRow[] = [
  {
    id: "sp1",
    name: "Rahul Verma",
    email: "rahul.sales@lubeflow.com",
    status: "approved",
    createdAt: "2026-03-16",
  },
  {
    id: "sp2",
    name: "Emily Carter",
    email: "emily.sales@lubeflow.com",
    status: "pending",
    createdAt: "2026-03-23",
  },
  {
    id: "sp3",
    name: "Omar Khalid",
    email: "omar.sales@lubeflow.com",
    status: "pending",
    createdAt: "2026-03-20",
  },
];

export const distributorsSeed: DistributorRow[] = [
  {
    id: "d1",
    name: "Metro Oils Supply",
    createdBy: "Aarav Singh",
    status: "pending",
    contactInfo: "+1 202-555-0182",
  },
  {
    id: "d2",
    name: "Prime Lubes Co.",
    createdBy: "Maya Patel",
    status: "approved",
    contactInfo: "ops@primelubes.com",
  },
  {
    id: "d3",
    name: "Torque Distribution",
    createdBy: "Nikhil Rao",
    status: "pending",
    contactInfo: "+1 202-555-0197",
  },
];

export const ordersSeed: OrderRow[] = [
  {
    id: "o1",
    distributorName: "Metro Oils Supply",
    itemsSummary: "Engine Oil x 120, Grease x 45",
    totalQty: 165,
    totalAmount: 12350,
    status: "pending",
    createdAt: "2026-03-24",
  },
  {
    id: "o2",
    distributorName: "Prime Lubes Co.",
    itemsSummary: "Hydraulic Fluid x 70",
    totalQty: 70,
    totalAmount: 8400,
    status: "processing",
    createdAt: "2026-03-21",
  },
  {
    id: "o3",
    distributorName: "Torque Distribution",
    itemsSummary: "Transmission Oil x 50, Coolant x 30",
    totalQty: 80,
    totalAmount: 6550,
    status: "approved",
    createdAt: "2026-03-13",
  },
];

export const couponsSeed: CouponRow[] = [
  {
    id: "c1",
    code: "SPRING10",
    type: "global",
    discountType: "percentage",
    discountValue: 10,
    usageLimit: 0,
    usageCount: 0,
    status: "active",
    validTill: "2026-04-15",
  },
  {
    id: "c2",
    code: "DISTRO25",
    type: "targeted",
    targetRole: "distributor",
    targetNames: ["Metro Oils Supply", "Prime Lubes Co."],
    discountType: "flat",
    discountValue: 25,
    usageLimit: 50,
    usageCount: 3,
    status: "inactive",
    validTill: "2026-05-01",
  },
];
