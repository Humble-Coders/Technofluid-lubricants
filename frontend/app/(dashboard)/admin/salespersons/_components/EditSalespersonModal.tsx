"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type EditSalespersonFormInput = {
  name: string;
  phone: string;
};

type EditSalespersonModalProps = {
  open: boolean;
  initial: EditSalespersonFormInput & { id: string };
  onClose: () => void;
  onSave: (id: string, fields: EditSalespersonFormInput) => Promise<void>;
};

export function EditSalespersonModal({
  open,
  initial,
  onClose,
  onSave,
}: EditSalespersonModalProps) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setPhone(initial.phone);
      setError(null);
    }
  }, [open, initial]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onSave(initial.id, { name: trimmedName, phone: phone.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title="Edit Salesperson"
      onClose={onClose}
      mode="workspace"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {error && (
          <div className="md:col-span-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
            {error}
          </div>
        )}
        <Input
          id="edit-salesperson-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
        />
        <Input
          id="edit-salesperson-phone"
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
        />
      </div>
    </Modal>
  );
}
