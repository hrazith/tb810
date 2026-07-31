"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { WaterBillFormState } from "@/server/water";
import {
  createUnitMeterReading,
  deleteUnitMeterReading,
  updateUnitMeterReading,
} from "@/server/water/unit-meter-readings";

type MeterReadingFormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

function toInput(formData: FormData) {
  return {
    unit_id: String(formData.get("unit_id") ?? ""),
    reading_date: String(formData.get("reading_date") ?? ""),
    reading_end: String(formData.get("reading_end") ?? ""),
    reading_start: String(formData.get("reading_start") ?? ""),
    status: String(formData.get("status") ?? "recorded") as "recorded" | "reviewed" | "approved" | "void",
    notes: String(formData.get("notes") ?? ""),
  };
}

export async function createUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const result = await createUnitMeterReading(toInput(formData));
  if (result.error) {
    return { error: result.error, values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])) };
  }
  revalidatePath("/water/unit-meter-readings");
  redirect("/water/unit-meter-readings");
}

export async function createInlineUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const result = await createUnitMeterReading(toInput(formData));
  if (result.error) {
    return {
      error: result.error,
      values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])),
    };
  }
  revalidatePath("/water/unit-meter-readings");
  return {
    success: "Reading added.",
    values: {
      unit_id: "",
      reading_date: String(formData.get("reading_date") ?? ""),
      reading_end: "",
      notes: "",
    },
  };
}

export async function updateUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const readingId = String(formData.get("reading_id") ?? "");
  const result = await updateUnitMeterReading(readingId, toInput(formData));
  if (result.error) {
    return { error: result.error, values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])) };
  }
  revalidatePath("/water/unit-meter-readings");
  redirect("/water/unit-meter-readings");
}

export async function updateInlineUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const readingId = String(formData.get("reading_id") ?? "");
  const result = await updateUnitMeterReading(readingId, toInput(formData));
  if (result.error) {
    return {
      error: result.error,
      values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])),
    };
  }
  revalidatePath("/water/unit-meter-readings");
  return {
    success: "Reading saved.",
    values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])),
  };
}

export async function deleteUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const readingId = String(formData.get("reading_id") ?? "");
  const result = await deleteUnitMeterReading(readingId);
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/water/unit-meter-readings");
  redirect(
    `/water/unit-meter-readings?deleted=${encodeURIComponent(`Reading deleted for Unit ${result.data.unit_number}.`)}`,
  );
}
