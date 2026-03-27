"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useDistributors } from "@/lib/useDistributors";
import { auth } from "@/lib/firebase";
import {
  CreateDistributorModal,
  type CreateDistributorFormInput,
} from "./_components/CreateDistributorModal";
import { DistributorsStats } from "./_components/DistributorsStats";
import { DistributorsTable } from "./_components/DistributorsTable";

export default function DistributorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { distributors, approveDistributor, createDistributor } =
    useDistributors();

  const filteredDistributors = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let rows = distributors;
    if (normalizedSearch) {
      rows = rows.filter((distributor) => {
        return (
          distributor.name.toLowerCase().includes(normalizedSearch) ||
          distributor.createdBy.toLowerCase().includes(normalizedSearch) ||
          distributor.contactInfo.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((distributor) => distributor.status === statusFilter);
    }

    return rows;
  }, [distributors, searchQuery, statusFilter]);

  const handleApprove = async (distributorId: string) => {
    try {
      await approveDistributor(distributorId);
    } catch (err) {
      console.error("Failed to approve distributor:", err);
    }
  };

  const handleCreate = async (distributorData: CreateDistributorFormInput) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        throw new Error("User must be logged in to create a distributor");
      }

      await createDistributor({
        ...distributorData,
        createdBy: currentUser.uid,
      });
      setIsCreateOpen(false);
    } catch (err) {
      console.error("Failed to create distributor:", err);
    }
  };

  return (
    <section className="space-y-5">
      <DistributorsStats distributors={distributors} />

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>
          Create Distributor
        </Button>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="distributor-search"
            label="Search"
            placeholder="Search name, creator, or contact"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Select
            id="distributor-status"
            label="Filter by Status"
            options={[
              { label: "All", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
            ]}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "pending" | "approved",
              )
            }
          />
        </div>
      </Card>

      <DistributorsTable
        distributors={filteredDistributors}
        onApprove={handleApprove}
      />

      <CreateDistributorModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />
    </section>
  );
}
