import { z } from "zod";

const decimalReadingSchema = z
  .string()
  .trim()
  .min(1, "This field is required.")
  .regex(/^\d+(?:\.\d{1,3})?$/, "Enter a valid reading.")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.padEnd(3, "0").slice(0, 3)}`;
  });

const moneySchema = z
  .string()
  .trim()
  .min(1, "Total invoiced is required.")
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "Enter a valid PEN amount.")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
  });

const optionalText = z
  .string()
  .trim()
  .max(2000, "Must be 2000 characters or fewer")
  .optional()
  .or(z.literal(""));

export const commonWaterBillInputSchema = z
  .object({
    bill_date: z.string().trim().min(1, "Bill date is required"),
    previous_reading: decimalReadingSchema,
    current_reading: decimalReadingSchema,
    amount: moneySchema,
    description: optionalText,
    notes: optionalText,
  })
  .superRefine((values, ctx) => {
    const previous = Number(values.previous_reading);
    const current = Number(values.current_reading);

    if (current < previous) {
      ctx.addIssue({
        code: "custom",
        path: ["current_reading"],
        message: "Current reading must be greater than or equal to previous reading.",
      });
    }
  });

export type CommonWaterBillInput = z.infer<typeof commonWaterBillInputSchema>;

export const commonWaterBillUpdateInputSchema = z
  .object({
    bill_date: z.string().trim().min(1, "Bill date is required"),
    previous_reading: decimalReadingSchema.optional(),
    current_reading: decimalReadingSchema,
    amount: moneySchema,
    description: optionalText,
    notes: optionalText,
  })
  .superRefine((values, ctx) => {
    if (Number(values.current_reading) < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["current_reading"],
        message: "Current reading must be zero or greater.",
      });
    }
  });

export type CommonWaterBillUpdateInput = z.infer<
  typeof commonWaterBillUpdateInputSchema
>;
