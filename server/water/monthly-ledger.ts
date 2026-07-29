import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding, listUnitTypes, listUnits } from "@/server/units";

import type { WaterBillRecord } from "./types";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

export type MonthlyWaterLedgerUnitRow = {
  unit_id: string;
  unit_number: string;
  floor: string | null;
  unit_type_name: string;
  current_reading: string;
  previous_reading: string;
  meter_reading_id: string | null;
};

export type MonthlyWaterLedgerData = {
  period_key: string;
  period_label: string;
  period_start: string;
  building_name: string;
  utility_bill: WaterBillRecord | null;
  units: MonthlyWaterLedgerUnitRow[];
};

export type MonthlyWaterLedgerSaveInput = {
  period_key: string;
  readings: Array<{
    unit_id: string;
    current_reading: string;
  }>;
};

export type MonthlyWaterLedgerSaveResult = {
  updated: number;
  created: number;
};

function parsePeriodKey(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(periodStart);

  return {
    year,
    month,
    periodStart,
    periodKey,
    periodLabel,
    periodStartIso: periodStart.toISOString().slice(0, 10),
  };
}

async function getCommonWaterUtilityTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", "common_water")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  return { data, error: null };
}

async function getBillingPeriodForMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  year: number,
  month: number,
) {
  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select("id, status, period_year, period_month")
    .eq("building_id", buildingId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getCommonWaterBillForBillingPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  billingPeriodId: string | null,
  utilityTypeId: string,
) {
  if (!billingPeriodId) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .select(
      "id, building_id, utility_type_id, billing_period_id, supplier_id, bill_date, amount, description, attachment_document_id, status, notes, previous_reading, current_reading, total_consumption, unit_cost, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at",
    )
    .eq("building_id", buildingId)
    .eq("billing_period_id", billingPeriodId)
    .eq("utility_type_id", utilityTypeId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getLatestMeterReadingMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitIds: string[],
  beforeDate: string,
) {
  if (unitIds.length === 0) {
    return { data: new Map<string, { id: string; reading_end: number | null; reading_start: number | null }>(), error: null };
  }

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .select("id, unit_id, reading_start, reading_end, reading_date, created_at")
    .in("unit_id", unitIds)
    .lt("reading_date", beforeDate)
    .order("reading_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  const map = new Map<string, { id: string; reading_end: number | null; reading_start: number | null }>();
  for (const row of data ?? []) {
    if (!map.has(row.unit_id)) {
      map.set(row.unit_id, {
        id: row.id,
        reading_end: row.reading_end,
        reading_start: row.reading_start,
      });
    }
  }

  return { data: map, error: null };
}

async function getCurrentMonthMeterReadingMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitIds: string[],
  readingDate: string,
) {
  if (unitIds.length === 0) {
    return { data: new Map<string, { id: string; reading_end: number | null }>(), error: null };
  }

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .select("id, unit_id, reading_end, reading_date, created_at")
    .in("unit_id", unitIds)
    .eq("reading_date", readingDate)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  const map = new Map<string, { id: string; reading_end: number | null }>();
  for (const row of data ?? []) {
    if (!map.has(row.unit_id)) {
      map.set(row.unit_id, {
        id: row.id,
        reading_end: row.reading_end,
      });
    }
  }

  return { data: map, error: null };
}

export async function getMonthlyWaterLedger(
  periodKey: string,
): Promise<QueryResult<MonthlyWaterLedgerData>> {
  const period = parsePeriodKey(periodKey);
  if (!period) {
    return { data: null as never, error: "Invalid period. Use YYYY-MM." };
  }

  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const [
    { data: utilityType, error: utilityTypeError },
    { data: unitTypes, error: unitTypesError },
    { data: billingPeriod, error: billingPeriodError },
  ] =
    await Promise.all([
      getCommonWaterUtilityTypeId(supabase),
      listUnitTypes(),
      getBillingPeriodForMonth(supabase, buildingResult.data.id, period.year, period.month),
    ]);

  if (utilityTypeError) return { data: null as never, error: utilityTypeError };
  if (unitTypesError) return { data: null as never, error: unitTypesError };
  if (billingPeriodError) return { data: null as never, error: billingPeriodError };
  if (!utilityType) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const condoType = unitTypes.find((unitType) => unitType.code === "condo");
  if (!condoType) {
    return { data: null as never, error: "Condo unit type is missing." };
  }

  const [unitsResult, utilityBillResult] = await Promise.all([
    listUnits({ unitTypeId: condoType.id }),
    getCommonWaterBillForBillingPeriod(
      supabase,
      buildingResult.data.id,
      billingPeriod?.id ?? null,
      utilityType.id,
    ),
  ]);

  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  if (utilityBillResult.error) return { data: null as never, error: utilityBillResult.error };

  const unitIds = unitsResult.data.map((unit) => unit.id);
  const [currentReadings, previousReadings] = await Promise.all([
    getCurrentMonthMeterReadingMap(supabase, unitIds, period.periodStartIso),
    getLatestMeterReadingMap(supabase, unitIds, period.periodStartIso),
  ]);

  if (currentReadings.error) return { data: null as never, error: currentReadings.error };
  if (previousReadings.error) return { data: null as never, error: previousReadings.error };
  const currentReadingMap =
    currentReadings.data ?? new Map<string, { id: string; reading_end: number | null }>();
  const previousReadingMap =
    previousReadings.data ??
    new Map<string, { id: string; reading_end: number | null; reading_start: number | null }>();

  return {
    data: {
      period_key: period.periodKey,
      period_label: period.periodLabel,
      period_start: period.periodStartIso,
      building_name: buildingResult.data.name,
      utility_bill: utilityBillResult.data,
      units: unitsResult.data.map((unit) => {
        const current = currentReadingMap.get(unit.id);
        const previous = previousReadingMap.get(unit.id);

        return {
          unit_id: unit.id,
          unit_number: unit.unit_number,
          floor: unit.floor,
          unit_type_name: unit.unit_type_name,
          current_reading: current?.reading_end?.toString() ?? "",
          previous_reading:
            previous?.reading_end?.toString() ??
            previous?.reading_start?.toString() ??
            "",
          meter_reading_id: current?.id ?? null,
        };
      }),
    },
    error: null,
  };
}

export async function saveMonthlyWaterLedgerReadings(
  input: MonthlyWaterLedgerSaveInput,
): Promise<QueryResult<MonthlyWaterLedgerSaveResult>> {
  const period = parsePeriodKey(input.period_key);
  if (!period) {
    return { data: null as never, error: "Invalid period. Use YYYY-MM." };
  }

  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const [{ data: unitTypes, error: unitTypesError }, { data: utilityType, error: utilityTypeError }] =
    await Promise.all([listUnitTypes(), getCommonWaterUtilityTypeId(supabase)]);

  if (unitTypesError) return { data: null as never, error: unitTypesError };
  if (utilityTypeError) return { data: null as never, error: utilityTypeError };
  if (!utilityType) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const condoType = unitTypes.find((unitType) => unitType.code === "condo");
  if (!condoType) {
    return { data: null as never, error: "Condo unit type is missing." };
  }

  const unitsResult = await listUnits({ unitTypeId: condoType.id });
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };

  const unitById = new Map(unitsResult.data.map((unit) => [unit.id, unit]));
  const unitIds = unitsResult.data.map((unit) => unit.id);
  const previousReadings = await getLatestMeterReadingMap(supabase, unitIds, period.periodStartIso);
  if (previousReadings.error) return { data: null as never, error: previousReadings.error };

  const currentReadings = await getCurrentMonthMeterReadingMap(supabase, unitIds, period.periodStartIso);
  if (currentReadings.error) return { data: null as never, error: currentReadings.error };
  const currentReadingMap = currentReadings.data ?? new Map<string, { id: string; reading_end: number | null }>();
  const previousReadingMap =
    previousReadings.data ??
    new Map<string, { id: string; reading_end: number | null; reading_start: number | null }>();

  let created = 0;
  let updated = 0;

  for (const reading of input.readings) {
    const unit = unitById.get(reading.unit_id);
    if (!unit) continue;

    const trimmed = reading.current_reading.trim();
    if (!trimmed) continue;

    const currentValue = Number(trimmed);
    if (!Number.isFinite(currentValue) || currentValue < 0) {
      return { data: null as never, error: `Invalid reading for unit ${unit.unit_number}.` };
    }

    const previousValue = previousReadingMap.get(unit.id)?.reading_end ?? null;
    const existing = currentReadingMap.get(unit.id) ?? null;
    const payload = {
      building_id: buildingResult.data.id,
      unit_id: unit.id,
      utility_type_id: utilityType.id,
      reading_date: period.periodStartIso,
      reading_start: previousValue,
      reading_end: currentValue,
      consumption: null,
      unit_of_measure: "m3",
      status: "recorded",
      notes: null,
    };

    if (existing) {
      const { error } = await supabase
        .from("tb810_meter_readings")
        .update(payload)
        .eq("id", existing.id);

      if (error) return { data: null as never, error: error.message };
      updated += 1;
    } else {
      const { error } = await supabase.from("tb810_meter_readings").insert(payload);
      if (error) return { data: null as never, error: error.message };
      created += 1;
    }
  }

  return { data: { created, updated }, error: null };
}
