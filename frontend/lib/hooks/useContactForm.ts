// File: frontend/lib/hooks/useContactForm.ts
"use client";

import { useState } from "react";
import {
  submitContactMessage,
  type ContactMessageInput,
} from "@/lib/services/contactService";

export type ContactFormStatus = "idle" | "submitting" | "success" | "error";

export interface ContactFieldErrors {
  name?: string;
  phone?: string;
  message?: string;
}

export function validateContactInput(
  input: ContactMessageInput,
): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  if (input.name.trim().length < 2) {
    errors.name = "Please enter your name.";
  }
  if (!/^[0-9+\-() ]{7,15}$/.test(input.phone.trim())) {
    errors.phone = "Please enter a valid phone number.";
  }
  if (input.message.trim().length < 5) {
    errors.message = "Please write a short message.";
  }
  return errors;
}

export function useContactForm() {
  const [status, setStatus] = useState<ContactFormStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});

  async function submit(input: ContactMessageInput): Promise<boolean> {
    const errors = validateContactInput(input);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return false;
    }
    setStatus("submitting");
    try {
      await submitContactMessage(input);
      setStatus("success");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }

  function reset() {
    setStatus("idle");
    setFieldErrors({});
  }

  return { status, fieldErrors, submit, reset };
}
