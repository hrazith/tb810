"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseMeterReadingTemplateWorkbook } from "@/server/import/excel/meter-reading-template";
import { persistMeterReadingImport } from "@/server/import/water/meter-reading-import-persistence";
import {
  validateMeterReadingImport,
  type MeterReadingImportSyncResult,
} from "@/server/import/water/meter-reading-import-validator";
import {
  createUnitMeterReading,
  clearCurrentUnitWaterMonth,
  deleteUnitMeterReading,
  getUnitOptions,
  listUnitMeterReadings,
  updateUnitMeterReading,
  canEditHistoricalReadingsServer,
} from "@/server/water/unit-meter-readings";
import { getActiveDevTestSessionId } from "@/server/dev-test-session";

type MeterReadingFormState = {
  success?: string;
  error?: string;
  values?: Record<string, string>;
};

export type ImportPreviewRow = {
  sourceRowNumber: number;
  unitNumber: string;
  readingEnd: number;
  readingText: string;
  unitId: string;
  previousReading: number | null;
  existingReadingId: string | null;
  readingDate: string | null;
  readingDateText: string | null;
  consumptionMonth: string | null;
  consumptionMonthText: string | null;
  readingDateColumnPresent: boolean;
  consumptionMonthColumnPresent: boolean;
};

export type ImportFormState = {
  success?: string;
  error?: string;
  summary?: Awaited<ReturnType<typeof parseMeterReadingTemplateWorkbook>>;
  validation?: MeterReadingImportSyncResult;
  previewRows?: ImportPreviewRow[];
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

function historicalEditIntent(formData: FormData) {
  return String(formData.get("dev_historical_edit_enabled") ?? "") === "true";
}

function userFacingReadingError(error: string) {
  const internalError = /duplicate key|violates .*constraint|constraint .* violated|relation .* does not exist|column .* does not exist|rpc/i.test(error);
  return internalError ? "Unable to save this reading. Please try again." : error;
}

export async function createUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const result = await createUnitMeterReading(
    toInput(formData),
    canEditHistoricalReadingsServer(historicalEditIntent(formData)),
  );
  if (result.error) {
    return { error: userFacingReadingError(result.error), values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])) };
  }
  revalidatePath("/water/unit-meter-readings");
  redirect("/water/unit-meter-readings");
}

export async function createInlineUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const result = await createUnitMeterReading(
    toInput(formData),
    canEditHistoricalReadingsServer(historicalEditIntent(formData)),
  );
  if (result.error) {
    return {
      error: userFacingReadingError(result.error),
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
  const result = await updateUnitMeterReading(
    readingId,
    toInput(formData),
    canEditHistoricalReadingsServer(historicalEditIntent(formData)),
  );
  if (result.error) {
    return { error: userFacingReadingError(result.error), values: Object.fromEntries(formData.entries().map(([k, v]) => [k, String(v)])) };
  }
  revalidatePath("/water/unit-meter-readings");
  redirect("/water/unit-meter-readings");
}

export async function updateInlineUnitMeterReadingAction(
  _prev: MeterReadingFormState,
  formData: FormData,
): Promise<MeterReadingFormState> {
  const readingId = String(formData.get("reading_id") ?? "");
  const result = await updateUnitMeterReading(
    readingId,
    toInput(formData),
    canEditHistoricalReadingsServer(historicalEditIntent(formData)),
  );
  if (result.error) {
    return {
      error: userFacingReadingError(result.error),
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
  const result = await deleteUnitMeterReading(
    readingId,
    canEditHistoricalReadingsServer(historicalEditIntent(formData)),
  );
  if (result.error) {
    return { error: userFacingReadingError(result.error) };
  }
  revalidatePath("/water/unit-meter-readings");
  redirect(
    `/water/unit-meter-readings?deleted=${encodeURIComponent(`Reading deleted for Unit ${result.data.unit_number}.`)}`,
  );
}

export async function clearCurrentUnitWaterMonthAction(
  monthKey: string,
  _prev: MeterReadingFormState,
  _formData: FormData,
): Promise<MeterReadingFormState> {
  void _prev;
  void _formData;
  const result = await clearCurrentUnitWaterMonth(monthKey);
  if (result.error) return { error: result.error };
  revalidatePath(`/water/unit-meter-readings/${monthKey}`);
  return { success: `Removed ${result.data.deletedCount} ${monthLabel(monthKey)} meter readings.` };
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
    return {
      summary,
      validation,
      previewRows: validation.acceptedRows.map((row) => ({
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        readingEnd: row.readingEnd,
        readingText: String(row.readingEnd),
        unitId: row.unitId,
        previousReading: row.previousReading,
        existingReadingId: row.existingReadingId,
        readingDate: row.readingDate,
        readingDateText: row.readingDateText,
        consumptionMonth: row.consumptionMonth,
        consumptionMonthText: row.consumptionMonthText,
        readingDateColumnPresent: row.readingDateColumnPresent,
        consumptionMonthColumnPresent: row.consumptionMonthColumnPresent,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook unreadable.";
    return { error: message };
  }
}

function isReadingDateForMonth(readingDate: string, monthKey: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(readingDate) && readingDate.startsWith(`${monthKey}-`);
}

export async function confirmCompletedTemplateAction(
  monthKey: string,
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const readingDate = String(formData.get("reading_date") ?? "").trim();
  const previewRowsValue = String(formData.get("preview_rows") ?? "");
  let previewRows: ImportPreviewRow[];
  try {
    previewRows = JSON.parse(previewRowsValue) as typeof previewRows;
  } catch {
    return { error: "The preview has expired. Upload the workbook again." };
  }

  try {
    const validation = await validateMeterReadingImport(monthKey, previewRows);
    if (validation.rejectedRows.length > 0 || validation.acceptedRows.length !== validation.expectedUnitCount) {
      return { error: "The workbook is no longer valid. Upload it again to review the current readings.", validation };
    }
    if (validation.rowDateMode === "none" && !isReadingDateForMonth(readingDate, monthKey)) {
      return { error: `Reading date must belong to ${monthLabel(monthKey)}.` };
    }

    const devSessionId = await getActiveDevTestSessionId();
    const writeResult = await persistMeterReadingImport(monthKey, validation.acceptedRows, readingDate || null, devSessionId);
    if (writeResult.error || !writeResult.data) {
      return { error: writeResult.error ?? "Import persistence returned no result." };
    }

    revalidatePath(`/water/unit-meter-readings/${monthKey}`);
    const [persistedRows, unitOptions] = await Promise.all([
      listUnitMeterReadings({ month: monthKey }),
      getUnitOptions(),
    ]);
    if (persistedRows.error) return { error: persistedRows.error };
    if (unitOptions.error) return { error: unitOptions.error };

    const completedUnitCountAfter = persistedRows.data.length;
    const expectedUnitCount = unitOptions.data.length;
    const completionPercentage = expectedUnitCount === 0 ? 0 : Math.round((completedUnitCountAfter / expectedUnitCount) * 100);
    return {
      success: `${monthLabel(monthKey)} meter readings saved. ${writeResult.data.processedCount} readings confirmed. ${completedUnitCountAfter} of ${expectedUnitCount} Units complete. ${completionPercentage}% complete.`,
      validation: {
        ...validation,
        newRowCount: writeResult.data.insertedCount,
        updatedRowCount: writeResult.data.updatedCount,
        acceptedRowCount: writeResult.data.processedCount,
        completedUnitCountAfter,
        remainingUnitCount: Math.max(expectedUnitCount - completedUnitCountAfter, 0),
        completionPercentage,
        expectedUnitCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm readings.";
    return { error: message };
  }
}
