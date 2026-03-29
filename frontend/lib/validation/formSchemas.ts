// File: frontend/lib/validation/formSchemas.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().trim().min(1, "Password is required."),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .trim()
    .min(6, "Password should be at least 6 characters."),
  role: z.enum(["salesperson", "distributor"]),
});

export const createStaffSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  phone: z.string().trim().min(1, "Phone is required."),
  email: z.string().trim().email("Enter a valid email address."),
});

export type LoginFormInput = z.infer<typeof loginSchema>;
export type SignupFormInput = z.infer<typeof signupSchema>;
export type CreateStaffFormInput = z.infer<typeof createStaffSchema>;
