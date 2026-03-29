// File: frontend/app/(dashboard)/salesperson/visits/_components/CreateVisitModal.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import type { Distributor } from "@/types/distributor";
import type { LeadType } from "@/types/visit";

export type CreateVisitFormInput = {
  distributorId: string;
  leadType: LeadType;
  notes: string;
  nextFollowUp: Date;
};

type CreateVisitModalProps = {
  distributors: Distributor[];
  onClose: () => void;
  onSubmit: (visit: CreateVisitFormInput) => Promise<void>;
};

export function CreateVisitModal({
  distributors,
  onClose,
  onSubmit,
}: CreateVisitModalProps) {
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [distributorId, setDistributorId] = useState("");
  const [leadType, setLeadType] = useState<LeadType>("warm");
  const [notes, setNotes] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const reset = () => {
    setDistributorId("");
    setLeadType("warm");
    setNotes("");
    setNextFollowUp("");
    setErrors({});
  };

  const handleCreate = async () => {
    const errors: Record<string, string> = {};

    if (!distributorId.trim()) {
      errors.distributorId = "Distributor is required";
    }
    if (!notes.trim()) {
      errors.notes = "Notes are required";
    }
    if (!nextFollowUp) {
      errors.nextFollowUp = "Follow-up date is required";
    }

    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        distributorId,
        leadType,
        notes: notes.trim(),
        nextFollowUp: new Date(nextFollowUp),
      });

      reset();
      onClose();
    } catch (error) {
      console.error("Error creating visit:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      title="Log Visit"
      onClose={onClose}
      mode="workspace"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? "Logging..." : "Log Visit"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          id="visit-distributor"
          label="Distributor"
          options={distributors.map((d) => ({
            label: d.name,
            value: d.uid,
          }))}
          value={distributorId}
          onChange={(e) => setDistributorId(e.target.value)}
          error={errors.distributorId}
        />

        <Select
          id="visit-lead-type"
          label="Lead Type"
          options={[
            { label: "Hot", value: "hot" },
            { label: "Warm", value: "warm" },
            { label: "Cold", value: "cold" },
          ]}
          value={leadType}
          onChange={(e) => setLeadType(e.target.value as LeadType)}
        />

        <div>
          <label
            htmlFor="visit-notes"
            className="block text-sm font-medium text-textPrimary"
          >
            Notes
          </label>
          <textarea
            id="visit-notes"
            placeholder="Log your visit details..."
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setErrors((prev) => ({ ...prev, notes: "" }));
            }}
            rows={4}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textPrimary placeholder-textSecondary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {errors.notes && (
            <p className="mt-1 text-xs text-danger">{errors.notes}</p>
          )}
        </div>

        <Input
          id="visit-followup"
          type="date"
          label="Next Follow-up Date"
          value={nextFollowUp}
          onChange={(event) => {
            setNextFollowUp(event.target.value);
            setErrors((prev) => ({ ...prev, nextFollowUp: "" }));
          }}
          error={errors.nextFollowUp}
        />
      </div>
    </Modal>
  );
}
