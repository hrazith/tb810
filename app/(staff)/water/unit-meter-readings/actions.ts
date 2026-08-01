"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { WaterBillFormState } from "@/server/water";
import { parseMeterReadingTemplateWorkbook } from "@/server/import/excel/meter-reading-template";
import { persistMeterReadingImport } from "@/server/import/water/meter-reading-import-persistence";
import {
  validateMeterReadingImport,
  type MeterReadingImportSyncResult,
} from "@/server/import/water/meter-reading-import-validator";
import {
  createUnitMeterReading,
  deleteUnitMeterReading,
  getUnitOptions,
  listUnitMeterReadings,
  updateUnitMeterReading,
} from "@/server/water/unit-meter-readings";

type MeterReadingFormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

type ImportFormState = {
  success?: string;
  error?: string;
  summary?: Awaited<ReturnType<typeof parseMeterReadingTemplateWorkbook>>;
  validation?: MeterReadingImportSyncResult;
};

function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

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

export async function uploadCompletedTemplateAction(
  monthKey: string,
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const template = formData.get("template");
  if (!(template instanceof File)) {
    return { error: "Unable to open workbook." };
  }

  try {
    const summary = await parseMeterReadingTemplateWorkbook(template);
    const validation = await validateMeterReadingImport(monthKey, summary.selectedWorksheet.parsedRows);
    const writeResult = await persistMeterReadingImport(monthKey, validation.acceptedRows);
    if (writeResult.error) {
      return { error: writeResult.error };
    }
    if (!writeResult.data) {
      return { error: "Import persistence returned no result." };
    }

    revalidatePath(`/water/unit-meter-readings/${monthKey}`);
    
    const [persistedRows, unitOptions] = await Promise.all([
      listUnitMeterReadings({ month: monthKey }),
      getUnitOptions(),
    ]);

    if (persistedRows.error) {
      return { error: persistedRows.error };
    }
    if (unitOptions.error) {
      return { error: unitOptions.error };
    }

    const completedUnitCountAfter = persistedRows.data.length;
    const expectedUnitCount = unitOptions.data.length;
    const completionPercentage = expectedUnitCount === 0 ? 0 : Math.round((completedUnitCountAfter / expectedUnitCount) * 100);

    const finalValidation: MeterReadingImportSyncResult = {
      ...validation,
      newRowCount: writeResult.data.insertedCount,
      updatedRowCount: writeResult.data.updatedCount,
      acceptedRowCount: writeResult.data.processedCount,
      completedUnitCountAfter,
      remainingUnitCount: Math.max(expectedUnitCount - completedUnitCountAfter, 0),
      completionPercentage,
      expectedUnitCount,
    };

    return {
      success: `${monthLabel(monthKey)} meter readings imported. ${writeResult.data.processedCount} readings accepted. ${writeResult.data.insertedCount} new. ${writeResult.data.updatedCount} updated. ${completedUnitCountAfter} of ${expectedUnitCount} Units complete. ${completionPercentage}% complete.`,
      summary,
      validation: finalValidation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook unreadable.";
    return { error: message };
  }
}
