// File: frontend/app/(dashboard)/admin/coupons/_lib/couponSchemas.ts
import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const baseCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Coupon code is required.")
      .max(40, "Coupon code is too long."),
    discountType: z.enum(["percentage", "flat"], {
      error: "Discount type is required.",
    }),
    discountValue: z.coerce
      .number({ error: "Enter a valid number." })
      .positive("Discount value must be greater than 0."),
    usageLimit: z.coerce
      .number({ error: "Enter a valid number." })
      .int("Must be a whole number.")
      .min(0, "Cannot be negative. Use 0 for unlimited."),
    validTill: z
      .string()
      .trim()
      .min(1, "Valid till date is required.")
      .regex(isoDateRegex, "Use YYYY-MM-DD date format."),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "percentage" && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 100,
        origin: "number",
        inclusive: true,
        message: "Percentage discount cannot exceed 100%.",
        path: ["discountValue"],
      });
    }
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
