import { z } from "zod";

export const chargeInputSchema = z.object({
  unit_id: z.string().trim().min(1, "Unit is required"),
  description: z.string().trim().min(1, "Description is required"),
  amount: z.number().refine((value) => value !== 0, "Amount must be non-zero"),
  schedule: z.enum(["one_off", "recurring"]),
  starts_month: z.string().trim().regex(/^\d{4}-\d{2}$/, "Start month must be YYYY-MM"),
  ends_month: z.string().trim().regex(/^\d{4}-\d{2}$/, "End month must be YYYY-MM").optional().or(z.literal("")).transform((value) => (value ? value : null)),
}).strict();

export const ownerChargeInputSchema = z.object({
  owner_id: z.string().trim().min(1, "Owner is required"),
  description: z.string().trim().min(1, "Description is required"),
  amount: z.number().refine((value) => value !== 0, "Amount must be non-zero"),
  schedule: z.enum(["one_off", "recurring"]),
  starts_month: z.string().trim().regex(/^\d{4}-\d{2}$/, "Start month must be YYYY-MM"),
  ends_month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "End month must be YYYY-MM")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
}).strict();

export const chargeEconomicsSchema = z.object({
  amount: z.number().refine((value) => value !== 0, "Amount must be non-zero"),
  effective_month: z.string().trim().regex(/^\d{4}-\d{2}$/, "Effective month must be YYYY-MM"),
}).strict();

export const chargeStopSchema = z.object({
  stop_month: z.string().trim().regex(/^\d{4}-\d{2}$/, "Stop month must be YYYY-MM"),
  note: z.string().trim().min(1, "Stop note is required"),
}).strict();

export const futureChargeEditSchema = z.object({
  charge_id: z.string().trim().min(1, "Charge is required"),
  description: z.string().trim().min(1, "Description is required"),
  amount: z.number().refine((value) => value !== 0, "Amount must be non-zero"),
  schedule: z.enum(["one_off", "recurring"]),
  starts_month: z.string().trim().regex(/^\d{4}-\d{2}$/, "Start month must be YYYY-MM"),
  ends_month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "End month must be YYYY-MM")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
}).strict();

export const futureChargeDeleteSchema = z.object({
  charge_id: z.string().trim().min(1, "Charge is required"),
}).strict();
