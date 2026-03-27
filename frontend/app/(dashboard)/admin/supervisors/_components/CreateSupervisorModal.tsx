"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createStaffSchema } from "@/lib/validation/formSchemas";

export type CreateSupervisorFormInput = {
  name: string;
  phone: string;
  email: string;
};

type CreateSupervisorModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (supervisor: CreateSupervisorFormInput) => Promise<void>;
};

export function CreateSupervisorModal({
  open,
  onClose,
  onCreate,
}: CreateSupervisorModalProps) {
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateSupervisorFormInput, string>>
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
    try {
      await onCreate(payload);

      reset();
      onClose();
    } catch (error) {
      console.error("Error creating supervisor:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      title="Create Supervisor"
      onClose={onClose}
      mode="workspace"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="supervisor-name"
          label="Name"
          placeholder="Enter supervisor name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((prev) => ({ ...prev, name: "" }));
          }}
          error={errors.name}
        />
        <Input
          id="supervisor-phone"
          label="Phone"
          placeholder="+1 202-555-0101"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setErrors((prev) => ({ ...prev, phone: "" }));
          }}
          error={errors.phone}
        />
        <Input
          id="supervisor-email"
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
        />
      </div>
    </Modal>
  );
}
