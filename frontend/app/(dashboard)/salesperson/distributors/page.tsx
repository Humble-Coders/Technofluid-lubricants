// File: frontend/app/(dashboard)/salesperson/distributors/page.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/useAuth";
import { useSalespersonDistributors } from "@/lib/useSalespersonDistributors";
import {
  CreateDistributorModal,
  type CreateDistributorFormInput,
} from "./_components/CreateDistributorModal";
import { DistributorsTable } from "./_components/DistributorsTable";

export default function SalespersonDistributorsPage() {
  const { userData } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { distributors, createDistributor, loading, error } =
    useSalespersonDistributors(userData?.uid ?? null);

  const filteredDistributors = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (!normalizedSearch) {
      return distributors;
    }

    return distributors.filter((distributor) => {
      return (
        distributor.name.toLowerCase().includes(normalizedSearch) ||
        distributor.phone?.toLowerCase().includes(normalizedSearch) ||
        distributor.email?.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [distributors, searchQuery]);

  const handleCreate = async (distributorData: CreateDistributorFormInput) => {
    try {
      await createDistributor({
        name: distributorData.name,
        email: distributorData.email,
        phone: distributorData.phone,
      });
      setIsCreateOpen(false);
    } catch (err) {
      console.error("Failed to create distributor:", err);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        Error loading distributors: {error}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-textSecondary">
                Total Distributors
              </p>
              <p className="mt-1 text-2xl font-bold text-textPrimary">
                {distributors.length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-textSecondary">Approved</p>
              <p className="mt-1 text-2xl font-bold text-textPrimary">
                {distributors.filter((d) => d.status === "approved").length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-textSecondary">Pending</p>
              <p className="mt-1 text-2xl font-bold text-textPrimary">
                {distributors.filter((d) => d.status === "pending").length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>
          Create Distributor
        </Button>
      </div>

      <Card>
        <div className="mb-4">
          <Input
            id="distributor-search"
            label="Search Distributors"
            placeholder="Search by name, phone, or email"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <DistributorsTable
          distributors={filteredDistributors}
          loading={loading}
        />
      </Card>

      {isCreateOpen && (
        <CreateDistributorModal
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </section>
  );
}
