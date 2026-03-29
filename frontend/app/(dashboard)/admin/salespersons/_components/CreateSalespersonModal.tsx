// File: frontend/app/(dashboard)/admin/salespersons/_components/CreateSalespersonModal.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createStaffSchema } from "@/lib/validation/formSchemas";

export type CreateSalespersonFormInput = {
  name: string;
  phone: string;
  email: string;
};

type CreateSalespersonModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (salesperson: CreateSalespersonFormInput) => Promise<void>;
};

export function CreateSalespersonModal({
  open,
  onClose,
  onCreate,
}: CreateSalespersonModalProps) {
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateSalespersonFormInput | "submit", string>>
  >({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setErrors({});
  };

  const handleCreate = async () => {
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };

    const parseResult = createStaffSchema.safeParse(payload);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        phone: fieldErrors.phone?.[0],
        email: fieldErrors.email?.[0],
      });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await onCreate(payload);
      reset();
      onClose();
    } catch (error) {
      // ✅ NEW: Show error to user
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create salesperson";
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title="Create Salesperson"
      onClose={onClose}
      mode="workspace"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* ✅ NEW: Show submit error */}
        {errors.submit && (
          <div className="md:col-span-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
            {errors.submit}
          </div>
        )}

        <Input
          id="salesperson-name"
          label="Name"
          placeholder="Enter salesperson name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((prev) => ({ ...prev, name: "" }));
          }}
          error={errors.name}
          disabled={isLoading}
        />
        <Input
          id="salesperson-phone"
          label="Phone"
          placeholder="+1 202-555-0102"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setErrors((prev) => ({ ...prev, phone: "" }));
          }}
          error={errors.phone}
          disabled={isLoading}
        />
        <Input
          id="salesperson-email"
          type="email"
          label="Email"
          placeholder="name@company.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((prev) => ({ ...prev, email: "" }));
          }}
          className="md:col-span-2"
          error={errors.email}
          disabled={isLoading}
        />
      </div>
    </Modal>
  );
}