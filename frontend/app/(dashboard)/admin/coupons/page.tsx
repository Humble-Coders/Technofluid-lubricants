// File: frontend/app/(dashboard)/admin/coupons/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { type CouponRow } from "../_data/mockData";
import { useCoupons } from "@/lib/useCoupons";
import { CouponsStats } from "./_components/CouponsStats";
import { CouponsTable } from "./_components/CouponsTable";
import { CreateCouponModal } from "./_components/CreateCouponModal";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";

export default function CouponsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "global" | "targeted">("all");
  const [deleteTarget, setDeleteTarget] = useState<CouponRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { coupons, loading, createCoupon, deleteCoupon } = useCoupons();

  const filteredCoupons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return coupons.filter((c) => {
      if (q && !c.code.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      return true;
    });
  }, [coupons, searchQuery, statusFilter, typeFilter]);

  const handleCreate = async (coupon: CouponRow) => {
    try {
      await createCoupon(coupon);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create coupon:", err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteCoupon(deleteTarget.id);
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <section className="space-y-5">
      <CouponsStats coupons={coupons} />

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="coupon-search"
            label="Search"
            placeholder="Search by code"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select
            id="coupon-status-filter"
            label="Status"
            options={[
              { label: "All Statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "active" | "inactive")
            }
          />
          <Select
            id="coupon-type-filter"
            label="Type"
            options={[
              { label: "All Types", value: "all" },
              { label: "Global", value: "global" },
              { label: "Targeted", value: "targeted" },
            ]}
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "all" | "global" | "targeted")
            }
          />
        </div>
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={() => setIsOpen(true)}>Create Coupon</Button>
      </div>

      <CouponsTable
        coupons={filteredCoupons}
        loading={loading}
        deletingId={deletingId}
        onDelete={setDeleteTarget}
      />

      <CreateCouponModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onCreate={handleCreate}
      />

      <DeleteConfirmModal
        open={!!deleteTarget}
        name={deleteTarget?.code ?? ""}
        title="Delete Coupon"
        description={
          deleteTarget
            ? `Are you sure you want to delete coupon "${deleteTarget.code}"? This cannot be undone.`
            : ""
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </section>
  );
}
