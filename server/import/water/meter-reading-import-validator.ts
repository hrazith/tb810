import { createClient } from "@/lib/supabase/server";
import { getActiveReadingMonth } from "@/server/water/unit-meter-readings";
import { getCurrentBuilding, listUnits } from "@/server/units";

import type { ParsedMeterReadingRow } from "../excel/meter-reading-template";

export type MeterReadingImportIssue = {
  code: string;
  message: string;
  sourceRowNumber?: number;
  unitNumber?: string;
  sourceRowNumbers?: number[];
};

export type ValidatedMeterReadingImportRow = {
  sourceRowNumber: number;
  unitNumber: string;
  readingEnd: number;
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

export type MeterReadingImportSyncResult = {
  monthKey: string;
  expectedUnitCount: number;
  uploadedRowCount: number;
  ignoredBlankRowCount: number;
  acceptedRowCount: number;
  newRowCount: number;
  updatedRowCount: number;
  rejectedRowCount: number;
  existingRowCount: number;
  completedUnitCountBefore: number;
  completedUnitCountAfter: number;
  remainingUnitCount: number;
  completionPercentage: number;
  acceptedRows: ValidatedMeterReadingImportRow[];
  rejectedRows: MeterReadingImportIssue[];
  canonicalColumns: string[];
  rowDateMode: "none" | "row";
};

function monthStart(monthKey: string) {
  return `${monthKey}-01`;
}

function nextMonthStart(monthKey: string) {
  const parsed = new Date(`${monthStart(monthKey)}T00:00:00Z`);
  const next = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthStart(monthKey)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function normalizeCount(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function readingText(value: number | null) {
  return value == null ? "—" : value.toFixed(3).replace(/\.?0+$/, "");
}

function isBlank(value: string | null | undefined) {
  return !value || value.trim() === "";
}

export async function validateMeterReadingImport(
  monthKey: string,
  rows: ParsedMeterReadingRow[],
): Promise<MeterReadingImportSyncResult> {
  const active = getActiveReadingMonth();
  if (monthKey !== active.key) {
    throw new Error(`The selected month ${monthLabel(monthKey)} is not editable.`);
  }

  const supabase = await createClient();
  const [buildingResult, unitsResult, utilityTypeResult] = await Promise.all([
    getCurrentBuilding(),
    listUnits(),
    supabase.from("tb810_utility_types").select("id, code").eq("code", "common_water").maybeSingle(),
  ]);

  if (buildingResult.error) throw new Error(buildingResult.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (utilityTypeResult.error) throw new Error(utilityTypeResult.error.message);

  const building = buildingResult.data;
  const utilityType = utilityTypeResult.data;
  if (!building || !utilityType) {
    throw new Error("Common water context is missing.");
  }

  const eligibleUnits = (unitsResult.data ?? []).filter((unit) => unit.unit_type_code === "condo");
  const eligibleByNumber = new Map(eligibleUnits.map((unit) => [unit.unit_number, unit]));
  const expectedUnitCount = eligibleUnits.length;

  const selectedMonthStart = monthStart(monthKey);
  const selectedMonthEnd = nextMonthStart(monthKey);

  const [{ data: existingRows, error: existingError }, { data: priorRows, error: priorError }] =
    await Promise.all([
      supabase
        .from("tb810_meter_readings")
        .select("id, unit_id, reading_end")
        .eq("building_id", building.id)
        .eq("utility_type_id", utilityType.id)
        .gte("reading_date", selectedMonthStart)
        .lt("reading_date", selectedMonthEnd),
      supabase
        .from("tb810_meter_readings")
        .select("unit_id, reading_end, reading_date, created_at")
        .eq("building_id", building.id)
        .eq("utility_type_id", utilityType.id)
        .lt("reading_date", selectedMonthStart)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (existingError) throw new Error(existingError.message);
  if (priorError) throw new Error(priorError.message);

  const existingByUnitNumber = new Map<string, { id: string }>();
  for (const row of existingRows ?? []) {
    const unit = (unitsResult.data ?? []).find((item) => item.id === row.unit_id);
    if (unit) {
      existingByUnitNumber.set(unit.unit_number, { id: row.id });
    }
  }

  const priorByUnitId = new Map<string, number>();
  for (const row of priorRows ?? []) {
    if (!priorByUnitId.has(row.unit_id) && row.reading_end != null) {
      priorByUnitId.set(row.unit_id, row.reading_end);
    }
  }

  const suppliedRows = rows;
  const ignoredBlankRowCount = 0;

  const groups = new Map<string, ParsedMeterReadingRow[]>();
  for (const row of suppliedRows) {
    const current = groups.get(row.unitNumber) ?? [];
    current.push(row);
    groups.set(row.unitNumber, current);
  }

  const rejectedRows: MeterReadingImportIssue[] = [];
  const acceptedRows: ValidatedMeterReadingImportRow[] = [];
  const rejectedUnitNumbers = new Set<string>();
  const dateSuppliedRows = suppliedRows.filter((row) => row.readingDateText);
  const rowDateMode = dateSuppliedRows.length === 0 ? "none" : "row";
  if (dateSuppliedRows.length > 0 && dateSuppliedRows.length !== suppliedRows.length) {
    rejectedRows.push({
      code: "READING_DATE_MIXED",
      message: "Reading dates must be populated for every row or omitted for the entire batch.",
    });
  }
  for (const row of dateSuppliedRows) {
    if (!row.readingDate) {
      rejectedRows.push({
        code: "READING_DATE_INVALID",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} reading date is invalid.`,
      });
    } else if (!row.readingDate.startsWith(`${monthKey}-`)) {
      rejectedRows.push({
        code: "READING_DATE_WRONG_MONTH",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} reading date must belong to ${monthLabel(monthKey)}.`,
      });
    }
    if (row.consumptionMonthText && row.consumptionMonth !== monthKey) {
      rejectedRows.push({
        code: "CONSUMPTION_MONTH_WRONG",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} consumption month must be ${monthLabel(monthKey)}.`,
      });
    }
  }
  for (const row of suppliedRows.filter((item) => item.consumptionMonthText && !dateSuppliedRows.includes(item))) {
    if (row.consumptionMonth !== monthKey) {
      rejectedRows.push({
        code: "CONSUMPTION_MONTH_WRONG",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} consumption month must be ${monthLabel(monthKey)}.`,
      });
    }
  }

  for (const row of suppliedRows) {
    if (isBlank(row.unitNumber)) {
      rejectedRows.push({
        code: "UNIT_BLANK",
        sourceRowNumber: row.sourceRowNumber,
        message: `Row ${row.sourceRowNumber} — Unidad is blank.`,
      });
      continue;
    }

    const duplicateGroup = groups.get(row.unitNumber) ?? [];
    if (duplicateGroup.length > 1) {
      if (!rejectedUnitNumbers.has(row.unitNumber)) {
        const sourceRowNumbers = duplicateGroup.map((item) => item.sourceRowNumber).sort((a, b) => a - b);
        rejectedRows.push({
          code: "UNIT_DUPLICATE",
          unitNumber: row.unitNumber,
          sourceRowNumbers,
          message: `Unit ${row.unitNumber} appears more than once in rows ${sourceRowNumbers.join(" and ")}.`,
        });
        rejectedUnitNumbers.add(row.unitNumber);
      }
      continue;
    }

    const unit = eligibleByNumber.get(row.unitNumber);
    if (!unit) {
      rejectedRows.push({
        code: "UNIT_UNKNOWN",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} is not recognized.`,
      });
      continue;
    }

    if (row.readingEnd == null) {
      rejectedRows.push({
        code: "READING_INVALID",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} reading is invalid.`,
      });
      continue;
    }

    if (row.readingEnd < 0) {
      rejectedRows.push({
        code: "READING_NEGATIVE",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} reading ${readingText(row.readingEnd)} is negative.`,
      });
      continue;
    }

    const prior = priorByUnitId.get(unit.id) ?? null;
    if (prior != null && row.readingEnd < prior) {
      rejectedRows.push({
        code: "READING_LOWER_THAN_PRIOR",
        sourceRowNumber: row.sourceRowNumber,
        unitNumber: row.unitNumber,
        message: `Unit ${row.unitNumber} reading ${readingText(row.readingEnd)} is lower than previous reading ${readingText(prior)}.`,
      });
      continue;
    }

    acceptedRows.push({
      sourceRowNumber: row.sourceRowNumber,
      unitNumber: row.unitNumber,
      readingEnd: row.readingEnd,
      unitId: unit.id,
      previousReading: prior,
      existingReadingId: existingByUnitNumber.get(row.unitNumber)?.id ?? null,
      readingDate: row.readingDate,
      readingDateText: row.readingDateText,
      consumptionMonth: row.consumptionMonth,
      consumptionMonthText: row.consumptionMonthText,
      readingDateColumnPresent: row.readingDateColumnPresent,
      consumptionMonthColumnPresent: row.consumptionMonthColumnPresent,
    });
  }

  const completedUnitIdsBefore = new Set(existingByUnitNumber.keys());
  const completedUnitIdsAfter = new Set([
    ...completedUnitIdsBefore,
    ...acceptedRows.map((row) => row.unitNumber),
  ]).size;
  const remainingUnitCount = Math.max(expectedUnitCount - completedUnitIdsAfter, 0);

  const newRowCount = acceptedRows.filter((row) => !row.existingReadingId).length;
  const updatedRowCount = acceptedRows.length - newRowCount;
  const suppliedUnitNumbers = new Set(suppliedRows.map((row) => row.unitNumber));
  for (const unit of eligibleUnits) {
    if (!suppliedUnitNumbers.has(unit.unit_number)) {
      rejectedRows.push({
        code: "UNIT_MISSING",
        unitNumber: unit.unit_number,
        message: `Unit ${unit.unit_number} is missing from the workbook.`,
      });
    }
  }

  return {
    monthKey,
    expectedUnitCount,
    uploadedRowCount: rows.length,
    ignoredBlankRowCount,
    acceptedRowCount: acceptedRows.length,
    newRowCount,
    updatedRowCount,
    rejectedRowCount: rejectedRows.length,
    existingRowCount: existingRows?.length ?? 0,
    completedUnitCountBefore: completedUnitIdsBefore.size,
    completedUnitCountAfter: completedUnitIdsAfter,
    remainingUnitCount,
    completionPercentage: normalizeCount(completedUnitIdsAfter, expectedUnitCount),
    acceptedRows,
    rejectedRows,
    canonicalColumns: ["Unit", "Reading"],
    rowDateMode,
  };
}
