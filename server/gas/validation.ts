import { z } from "zod";

export const gasBillInputSchema = z.object({
  building_id: z.string().trim().min(1, "Building is required"),
  supplier_name: z.string().trim().min(1, "Supplier is required"),
  invoice_number: z.string().trim().min(1, "Invoice number is required"),
  invoice_date: z.string().trim().min(1, "Invoice date is required"),
  amount: z.number().min(0, "Amount must be non-negative"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")).transform((value) => (value ? value.trim() : null)),
});

export const gasReadingInputSchema = z.object({
  building_id: z.string().trim().min(1, "Building is required"),
  unit_id: z.string().trim().min(1, "Unit is required"),
  reading_month: z.string().trim().min(1, "Reading month is required"),
  reading_date: z.string().trim().min(1, "Reading date is required"),
  previous_reading: z.union([z.number().min(0), z.null()]).optional(),
  current_reading: z.number().min(0, "Current reading must be non-negative"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")).transform((value) => (value ? value.trim() : null)),
});

export type GasBillInputSchema = z.infer<typeof gasBillInputSchema>;
export type GasReadingInputSchema = z.infer<typeof gasReadingInputSchema>;
