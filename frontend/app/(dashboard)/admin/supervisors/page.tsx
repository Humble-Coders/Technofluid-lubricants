"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useSupervisors } from "@/lib/useSupervisors";
import { auth } from "@/lib/firebase";
import {
  CreateSupervisorModal,
  type CreateSupervisorFormInput,
} from "./_components/CreateSupervisorModal";
import { SupervisorsStats } from "./_components/SupervisorsStats";
import { SupervisorsTable } from "./_components/SupervisorsTable";

export default function SupervisorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved"
  >("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { supervisors, approveSupervisor, createSupervisor } = useSupervisors();

  const filteredSupervisors = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    let rows = supervisors;
    if (normalizedSearch) {
      rows = rows.filter((supervisor) => {
        return (
          supervisor.name.toLowerCase().includes(normalizedSearch) ||
          supervisor.email.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (statusFilter !== "all") {
      rows = rows.filter((supervisor) => supervisor.status === statusFilter);
    }

    return rows;
  }, [searchQuery, statusFilter, supervisors]);

  const handleApprove = async (id: string) => {
    try {
      await approveSupervisor(id);
    } catch (err) {
      console.error("Failed to approve supervisor:", err);
    }
  };

  const handleCreate = async (supervisorData: CreateSupervisorFormInput) => {
    try {
      await createSupervisor({
        ...supervisorData,
        createdBy: auth.currentUser?.uid,
      });
      setIsCreateOpen(false);
    } catch (err) {
      console.error("Failed to create supervisor:", err);
    }
  };

  return (
    <section className="space-y-5">
      <SupervisorsStats supervisors={supervisors} />

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>Create Supervisor</Button>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="supervisor-search"
            label="Search"
            placeholder="Search name or email"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Select
            id="supervisor-status"
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

      <SupervisorsTable
        supervisors={filteredSupervisors}
        onApprove={handleApprove}
      />

      <CreateSupervisorModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />
    </section>
  );
}
