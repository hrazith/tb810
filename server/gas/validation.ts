import { z } from "zod";

export function isValidGasBillDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function userFacingGasBillError(error: string) {
  if (error === "You are not authorized to manage Gas supplier bills.") return error;
  if (error === "Processed bills are read-only.") return error;
  if (error === "Bill not found or unavailable.") return error;
  if (/duplicate key|unique constraint|invoice_number/i.test(error)) return "Invoice / receipt number already exists.";
  return "Unable to save this Gas supplier bill. Please try again.";
}

export const gasBillInputSchema = z.object({
  supplier_name: z.string().trim().min(1, "Supplier is required"),
  invoice_number: z.string().trim().min(1, "Invoice number is required"),
  invoice_date: z.string().trim().min(1, "Invoice date is required").refine(isValidGasBillDate, "Invoice date must be a valid date"),
  amount: z.number().finite().min(0, "Amount must be non-negative").refine((value) => Number.isInteger(value * 100), "Amount must use at most 2 decimal places"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")).transform((value) => (value ? value.trim() : null)),
});

export const gasReadingInputSchema = z.object({
  unit_id: z.string().trim().min(1, "Unit is required"),
  reading_month: z.string().trim().min(1, "Reading month is required"),
  reading_date: z.string().trim().min(1, "Reading date is required"),
  current_reading: z.number().min(0, "Current reading must be non-negative"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")).transform((value) => (value ? value.trim() : null)),
});

export type GasBillInputSchema = z.infer<typeof gasBillInputSchema>;
export type GasReadingInputSchema = z.infer<typeof gasReadingInputSchema>;
