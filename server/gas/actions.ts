"use server";

import { z } from "zod";

import {
  createGasBill,
  createGasReading,
  deleteGasBill,
  deleteGasReading,
  importGasWorkbook,
  updateGasBill,
  updateGasReading,
} from "./index";
import type { GasImportPreflight } from "./import";
import { gasBillInputSchema, gasReadingInputSchema } from "./validation";

export type GasFormState = {
  success?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  review?: GasImportReviewState;
};

export type GasImportReviewState = GasImportPreflight & {
  confirmed?: boolean;
  readyToImport?: boolean;
  billMatches: number;
  readingMatches: number;
};

function mapFieldErrors(issues: z.ZodIssue[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function toValues(formData: FormData) {
  return Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)]));
}

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toBoolean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim() === "true";
}

export async function createGasBillAction(_prev: GasFormState, formData: FormData): Promise<GasFormState> {
  const values = {
    supplier_name: String(formData.get("supplier_name") ?? ""),
    invoice_number: String(formData.get("invoice_number") ?? ""),
    invoice_date: String(formData.get("invoice_date") ?? ""),
    amount: toNumber(formData.get("amount")),
    notes: String(formData.get("notes") ?? ""),
  };
  const validation = gasBillInputSchema.safeParse(values);
  if (!validation.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: mapFieldErrors(validation.error.issues), values: toValues(formData) };
  }
  const result = await createGasBill(validation.data);
  if (result.error) return { error: result.error, values: toValues(formData) };
  return { success: "Bill saved.", values: { bill_id: result.data.id } };
}

export async function updateGasBillAction(_prev: GasFormState, formData: FormData): Promise<GasFormState> {
  const billId = String(formData.get("bill_id") ?? "");
  const values = {
    supplier_name: String(formData.get("supplier_name") ?? ""),
    invoice_number: String(formData.get("invoice_number") ?? ""),
    invoice_date: String(formData.get("invoice_date") ?? ""),
    amount: toNumber(formData.get("amount")),
    notes: String(formData.get("notes") ?? ""),
  };
  const validation = gasBillInputSchema.safeParse(values);
  if (!validation.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: mapFieldErrors(validation.error.issues), values: toValues(formData) };
  }
  const result = await updateGasBill(billId, validation.data);
  if (result.error) return { error: result.error, values: toValues(formData) };
  return { success: "Bill saved.", values: { bill_id: result.data.id } };
}

export async function deleteGasBillAction(formData: FormData): Promise<void> {
  const result = await deleteGasBill(String(formData.get("bill_id") ?? ""));
  if (result.error) throw new Error(result.error);
}

export async function createGasReadingAction(_prev: GasFormState, formData: FormData): Promise<GasFormState> {
  const values = {
    unit_id: String(formData.get("unit_id") ?? ""),
    reading_month: String(formData.get("reading_month") ?? ""),
    reading_date: String(formData.get("reading_date") ?? ""),
    current_reading: toNumber(formData.get("current_reading")),
    notes: String(formData.get("notes") ?? ""),
  };
  const validation = gasReadingInputSchema.safeParse(values);
  if (!validation.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: mapFieldErrors(validation.error.issues), values: toValues(formData) };
  }
  const result = await createGasReading(validation.data);
  if (result.error) return { error: result.error, values: toValues(formData) };
  return { success: "Reading saved.", values: { reading_id: result.data.id } };
}

export async function updateGasReadingAction(_prev: GasFormState, formData: FormData): Promise<GasFormState> {
  const readingId = String(formData.get("reading_id") ?? "");
  const values = {
    unit_id: String(formData.get("unit_id") ?? ""),
    reading_month: String(formData.get("reading_month") ?? ""),
    reading_date: String(formData.get("reading_date") ?? ""),
    current_reading: toNumber(formData.get("current_reading")),
    notes: String(formData.get("notes") ?? ""),
  };
  const validation = gasReadingInputSchema.safeParse(values);
  if (!validation.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: mapFieldErrors(validation.error.issues), values: toValues(formData) };
  }
  const result = await updateGasReading(readingId, validation.data);
  if (result.error) return { error: result.error, values: toValues(formData) };
  return { success: "Reading saved.", values: { reading_id: result.data.id } };
}

export async function deleteGasReadingAction(formData: FormData): Promise<void> {
  const result = await deleteGasReading(String(formData.get("reading_id") ?? ""));
  if (result.error) throw new Error(result.error);
}

export async function importGasWorkbookAction(_prev: GasFormState, formData: FormData): Promise<GasFormState> {
  const file = formData.get("workbook");
  if (!(file instanceof File)) {
    return { error: "Unable to open workbook." };
  }
  const confirmed = toBoolean(formData.get("confirmed"));
  const result = await importGasWorkbook(file, confirmed);
  if (result.error) return { error: result.error, review: result.review };
  if (!result.imported) {
    return {
      review: result.review,
      success: "Review the workbook summary, then confirm import to write records.",
    };
  }
  return { success: `Imported ${result.data.importedBillCount} bills and ${result.data.importedReadingCount} readings from ${file.name}.` };
}
