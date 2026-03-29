// File: frontend/app/(dashboard)/admin/coupons/_lib/couponSchemas.ts
import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const baseCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Coupon code is required.")
    .max(40, "Coupon code is too long."),
  discount: z.string().trim().min(1, "Discount is required."),
  validTill: z
    .string()
    .trim()
    .min(1, "Valid till date is required.")
    .regex(isoDateRegex, "Use YYYY-MM-DD date format."),
});

const globalCouponSchema = baseCouponSchema.extend({
  type: z.literal("global"),
});

const targetedCouponSchema = baseCouponSchema.extend({
  type: z.literal("targeted"),
  targetRole: z.enum(["salesperson", "distributor"]),
  targetNames: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one target."),
});

export const createCouponSchema = z.discriminatedUnion("type", [
  globalCouponSchema,
  targetedCouponSchema,
]);

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
