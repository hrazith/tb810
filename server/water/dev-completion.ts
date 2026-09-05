import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getCurrentBuilding } from "@/server/units";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";
import {
  getActiveDevTestSessionId,
  getActiveDevTestSessionSummary,
  recordDevTestMutation,
} from "@/server/dev-test-session";

import { getWaterReadingUnits } from "./unit-meter-readings";

export type WaterCompletionUnit = {
  id: string;
  unit_number: string;
  unit_type_code: "condo" | "parking" | "storage";
  has_meter: boolean;
};

export type WaterCompletionReading = {
  unit_id: string;
  reading_date: string;
  reading_end: number | null;
  reading_start: number | null;
  consumption: number | null;
  created_at: string;
};

export type WaterCompletionDraft = {
  unitId: string;
  unitNumber: string;
  readingDate: string;
  readingStart: number | null;
  readingEnd: number;
  consumption: number;
};

type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

function monthKeyFromDateKey(value: string) {
  return value.slice(0, 7);
}

function roundToThree(value: number) {
  return Number(value.toFixed(3));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function priorReadingsForUnit(readings: WaterCompletionReading[], unitId: string, sourceReadingMonth: string) {
  return readings
    .filter((reading) => reading.unit_id === unitId && monthKeyFromDateKey(reading.reading_date) < sourceReadingMonth)
    .sort((left, right) => right.reading_date.localeCompare(left.reading_date) || right.created_at.localeCompare(left.created_at));
}

export function buildMissingWaterReadingDrafts(input: {
  sourceReadingMonth: string;
  readingDate: string;
  units: WaterCompletionUnit[];
  readings: WaterCompletionReading[];
}): QueryResult<WaterCompletionDraft[]> {
  const eligibleUnits = input.units.filter((unit) => unit.unit_type_code === "condo");
  const sourceMonthReadings = new Map<string, WaterCompletionReading>();

  for (const reading of input.readings) {
    if (monthKeyFromDateKey(reading.reading_date) !== input.sourceReadingMonth) continue;
    if (!sourceMonthReadings.has(reading.unit_id)) {
      sourceMonthReadings.set(reading.unit_id, reading);
    }
  }

  const currentMonthConsumptionValues = [...sourceMonthReadings.values()]
    .map((reading) => reading.consumption)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const currentMonthAverageConsumption = average(currentMonthConsumptionValues);

  const missing = eligibleUnits.filter((unit) => !sourceMonthReadings.has(unit.id));
  const drafts: WaterCompletionDraft[] = [];
  const missingWithoutBaseline: string[] = [];

  for (const unit of missing) {
    const priorReadings = priorReadingsForUnit(input.readings, unit.id, input.sourceReadingMonth);
    const previousCompleteReading = priorReadings.find((reading) => reading.reading_end !== null) ?? null;
    const historicalConsumptionValues = priorReadings
      .map((reading) => reading.consumption)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const historicalAverageConsumption = average(historicalConsumptionValues);
    const baselineConsumption =
      previousCompleteReading?.consumption ??
      historicalAverageConsumption ??
      currentMonthAverageConsumption ??
      null;

    if (baselineConsumption === null) {
      missingWithoutBaseline.push(unit.unit_number);
      continue;
    }

    const generatedConsumption = roundToThree(Math.max(0.001, baselineConsumption));
    const previousReading = previousCompleteReading?.reading_end ?? null;
    const readingEnd = roundToThree((previousReading ?? 0) + generatedConsumption);

    drafts.push({
      unitId: unit.id,
      unitNumber: unit.unit_number,
      readingDate: input.readingDate,
      readingStart: previousReading,
      readingEnd,
      consumption: generatedConsumption,
    });
  }

  if (missingWithoutBaseline.length > 0) {
    return {
      data: null,
      error: `Unable to build Water completion drafts for Units: ${missingWithoutBaseline.join(", ")}.`,
    };
  }

  return { data: drafts, error: null };
}

function businessMonthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthStartFromMonthKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

export async function getCommonWaterUtilityTypeId() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code")
    .eq("code", "common_water")
    .maybeSingle();

  if (error) return { data: null as never, error: error.message };
  if (!data) return { data: null as never, error: "Common Water utility type is missing." };
  return { data: data.id, error: null };
}

export async function completeMissingWaterReadingsForCurrentBusinessMonth(): Promise<QueryResult<{ insertedCount: number }>> {
  if (process.env.NODE_ENV !== "development") {
    return { data: null as never, error: "DEV test actions are development-only." };
  }

  const session = await getActiveDevTestSessionSummary();
  if (!session) {
    return { data: null as never, error: "Start a DEV test session first." };
  }

  const sessionId = await getActiveDevTestSessionId();
  if (!sessionId) {
    return { data: null as never, error: "Start a DEV test session first." };
  }

  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Current building not found." };

  const businessNow = await getBusinessNow();
  const sourceReadingMonth = businessMonthKeyFromDate(businessNow);
  const readingDate = businessNow.toISOString().slice(0, 10);
  const nextMonthStart = nextMonthStartFromMonthKey(sourceReadingMonth);

  const supabase = await createClient();
  const [waterUnitsResult, commonWaterTypeResult, readingsResult] = await Promise.all([
    getWaterReadingUnits(),
    getCommonWaterUtilityTypeId(),
    supabase
      .from("tb810_meter_readings")
      .select("unit_id, reading_date, reading_end, reading_start, consumption, created_at")
      .eq("building_id", building.data.id)
      .lt("reading_date", nextMonthStart)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (waterUnitsResult.error) return { data: null as never, error: waterUnitsResult.error };
  if (commonWaterTypeResult.error) return { data: null as never, error: commonWaterTypeResult.error };
  if (readingsResult.error) return { data: null as never, error: readingsResult.error.message };

  const waterUnits = waterUnitsResult.data ?? [];
  const commonWaterTypeId = commonWaterTypeResult.data ?? null;
  if (!commonWaterTypeId) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const draftsResult = buildMissingWaterReadingDrafts({
    sourceReadingMonth,
    readingDate,
    units: waterUnits.map((unit) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      unit_type_code: "condo",
      has_meter: true,
    })),
    readings: (readingsResult.data ?? []).map((reading) => ({
      unit_id: reading.unit_id,
      reading_date: reading.reading_date,
      reading_end: reading.reading_end,
      reading_start: reading.reading_start,
      consumption: reading.consumption,
      created_at: reading.created_at,
    })),
  });

  if (draftsResult.error) return { data: null as never, error: draftsResult.error };
  if (!draftsResult.data || draftsResult.data.length === 0) {
    invalidateBuildingMonthFinancialFactsCache(building.data.id);
    return { data: { insertedCount: 0 }, error: null };
  }

  const insertedIds: string[] = [];

  for (const draft of draftsResult.data) {
    const id = randomUUID();
    const { data, error } = await supabase
      .from("tb810_meter_readings")
      .insert({
        id,
        building_id: building.data.id,
        unit_id: draft.unitId,
        utility_type_id: commonWaterTypeId,
        reading_date: draft.readingDate,
        reading_start: draft.readingStart,
        reading_end: draft.readingEnd,
        consumption: draft.consumption,
        unit_of_measure: "m3",
        status: "recorded",
        notes: null,
        entered_at: businessNow.toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      if (insertedIds.length > 0) {
        await supabase.from("tb810_meter_readings").delete().in("id", insertedIds);
      }
      return { data: null as never, error: error.message };
    }

    insertedIds.push(data.id);

    const journalResult = await recordDevTestMutation({
      domain: "water",
      recordType: "meter_reading",
      operation: "create",
      recordIdentity: data.id,
    });

    if (journalResult.error) {
      await supabase.from("tb810_meter_readings").delete().eq("id", data.id);
      if (insertedIds.length > 0) {
        await supabase.from("tb810_meter_readings").delete().in("id", insertedIds);
      }
      return { data: null as never, error: journalResult.error };
    }
  }

  invalidateBuildingMonthFinancialFactsCache(building.data.id);
  return { data: { insertedCount: insertedIds.length }, error: null };
}
