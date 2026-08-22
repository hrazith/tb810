import { createClient } from "@/lib/supabase/server";
import { isPerfLoggingEnabled } from "@/server/perf";
import {
  getActiveDevTestSessionId,
  isRecordCreatedByActiveDevTestSession,
  recordDevTestMutation,
} from "@/server/dev-test-session";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";
import { getCurrentBuilding } from "@/server/units";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

type CompletenessPerf = {
  utilityTypeMs: number;
  populationUnitsMs: number;
  meterReadingsMs: number;
  totalMs: number;
};

export type UnitMeterReadingStatus = "recorded" | "reviewed" | "approved" | "void";

export type UnitMeterReadingRecord = {
  id: string;
  building_id: string;
  unit_id: string;
  utility_type_id: string;
  reading_date: string;
  reading_start: number | null;
  reading_end: number | null;
  consumption: number | null;
  unit_of_measure: string;
  status: UnitMeterReadingStatus;
  notes: string | null;
  legacy_table: string | null;
  legacy_id: string | null;
  legacy_metadata: unknown;
  created_by: string | null;
  updated_by: string | null;
  entered_by: string | null;
  entered_at: string;
  created_at: string;
  updated_at: string;
};

export type UnitMeterReadingRow = UnitMeterReadingRecord & {
  unit_number: string;
  floor: string | null;
  reading_month_label: string;
  previous_reading: number | null;
  previous_reading_label: string;
  previous_reading_date: string | null;
  current_month_editable: boolean;
  alert_label: string | null;
};

export type UnitMeterReadingFilters = {
  query?: string;
  unitId?: string;
  month?: string;
  status?: "all" | UnitMeterReadingStatus;
};

export type UnitMeterReadingInput = {
  unit_id: string;
  reading_date: string;
  reading_end: string;
  reading_start?: string;
  status: UnitMeterReadingStatus;
  notes?: string;
};

export type UnitMeterReadingDefaults = {
  readingMonth: string;
  readingMonthKey: string;
  previousReading: number | null;
  previousReadingDate: string | null;
};

export function canEditHistoricalReadingsServer(
  intent: boolean,
) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.TB810_ALLOW_HISTORICAL_READING_EDITS === "true" &&
    intent
  );
}

export type UnitMeterReadingDeleteResult = {
  reading: UnitMeterReadingRecord;
  readingMonthKey: string;
  unit_number: string;
};

export type UnitOption = {
  id: string;
  unit_number: string;
  floor: string | null;
};

type PopulationUnit = {
  id: string;
  unit_type_id: string;
};

export type UnitMeterReadingMonthOption = {
  key: string;
  label: string;
};

export type MeterReadingCompletenessSummary = {
  monthKey: string;
  monthLabel: string;
  completedCount: number;
  totalExpectedCount: number;
  percentage: number;
  incompleteCount: number | null;
};

const READING_SELECT =
  "id, building_id, unit_id, utility_type_id, reading_date, reading_start, reading_end, consumption, unit_of_measure, status, notes, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, entered_by, entered_at, created_at, updated_at" as const;

function parseDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getActiveReadingMonth(now = new Date()) {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    key: `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}`,
    start: `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 0)).toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(utc),
  };
}

function monthKeyFromDate(date: string) {
  const parsed = parseDate(date);
  if (!parsed) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStartFromKey(monthKey: string) {
  return `${monthKey}-01`;
}

function nextMonthStartFromKey(monthKey: string) {
  const parsed = parseDate(monthStartFromKey(monthKey));
  if (!parsed) return null;
  const next = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

function previousMonthKeyFromDate(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  utc.setUTCMonth(utc.getUTCMonth() - 1);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(monthKey: string) {
  const parsed = parseDate(monthStartFromKey(monthKey));
  if (!parsed) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function monthLabelFromDate(date: string) {
  const parsed = parseDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function readingToText(value: number | null) {
  return value == null ? "—" : value.toFixed(3).replace(/\.?0+$/, "");
}

function logCompletenessPerf(input: { month: string; breakdown: CompletenessPerf }) {
  if (!isPerfLoggingEnabled()) return;
  console.info(
    [
      "[WATER_COMPLETENESS_PERF]",
      `month=${input.month}`,
      `utility_type_ms=${input.breakdown.utilityTypeMs}`,
      `population_units_ms=${input.breakdown.populationUnitsMs}`,
      `meter_readings_ms=${input.breakdown.meterReadingsMs}`,
      `total_ms=${input.breakdown.totalMs}`,
    ].join(" "),
  );
}

export async function listUnitMeterReadingMonths(): Promise<QueryResult<UnitMeterReadingMonthOption[]>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tb810_list_meter_reading_months", {
    p_building_id: buildingResult.data.id,
  });
  if (error) return { data: [], error: error.message };

  const months = ((data ?? []) as Array<{ reading_month: string | null }>)
    .map((row) => (row.reading_month ? row.reading_month.slice(0, 7) : null))
    .filter((key): key is string => Boolean(key))
    .map((key) => ({ key, label: monthLabelFromKey(key) }));

  const active = getActiveReadingMonth();
  if (!months.some((month) => month.key === active.key)) {
    months.unshift({ key: active.key, label: active.label });
  }

  return { data: months.sort((a, b) => b.key.localeCompare(a.key)), error: null };
}

async function getUtilityTypeId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", "common_water")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Common Water utility type is missing." };
  return { data, error: null };
}

async function getCondoUnits(): Promise<QueryResult<UnitOption[]>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const { data: condoType, error: condoTypeError } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name")
    .eq("code", "condo")
    .maybeSingle();
  if (condoTypeError) return { data: [], error: condoTypeError.message };
  if (!condoType) return { data: [], error: "Condo unit type is missing." };

  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, floor, unit_type_id")
    .eq("building_id", buildingResult.data.id)
    .eq("unit_type_id", condoType.id)
    .order("display_order", { ascending: true })
    .order("unit_number", { ascending: true });
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? [])
      .map((unit) => ({
        id: unit.id,
        unit_number: unit.unit_number,
        floor: unit.floor,
      })),
    error: null,
  };
}

export async function getWaterReadingUnits(): Promise<QueryResult<UnitOption[]>> {
  return getCondoUnits();
}

async function getCondoPopulationFacts(): Promise<QueryResult<PopulationUnit[]>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const [condoTypeResult, unitsResult] = await Promise.all([
    supabase.from("tb810_unit_types").select("id, code").eq("code", "condo").maybeSingle(),
    supabase
      .from("tb810_units")
      .select("id, unit_type_id")
      .eq("building_id", buildingResult.data.id)
      .order("display_order", { ascending: true })
      .order("unit_number", { ascending: true }),
  ]);

  if (condoTypeResult.error) return { data: [], error: condoTypeResult.error.message };
  if (!condoTypeResult.data) return { data: [], error: "Condo unit type is missing." };
  if (unitsResult.error) return { data: [], error: unitsResult.error.message };

  const condoTypeId = condoTypeResult.data.id;
  return {
    data: (unitsResult.data ?? []).filter((unit) => unit.unit_type_id === condoTypeId),
    error: null,
  };
}

async function getCondoUnitById(unitId: string) {
  const units = await getCondoUnits();
  if (units.error) return { data: null, error: units.error } as QueryResult<UnitOption | null>;
  return {
    data: units.data.find((unit) => unit.id === unitId) ?? null,
    error: null,
  } as QueryResult<UnitOption | null>;
}

async function getPriorReadingForUnit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  unitId: string,
  beforeMonthKey: string,
) {
  const beforeDate = monthStartFromKey(beforeMonthKey);
  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .select("id, reading_date, reading_end, reading_start, created_at")
    .eq("building_id", buildingId)
    .eq("utility_type_id", utilityTypeId)
    .eq("unit_id", unitId)
    .lt("reading_date", beforeDate)
    .order("reading_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

async function getCurrentMonthReadingsForBuilding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  monthKey: string,
) {
  const monthStart = monthStartFromKey(monthKey);
  const nextMonthStart = nextMonthStartFromKey(monthKey);
  if (!nextMonthStart) {
    return { data: [], error: "Invalid reading month." };
  }

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .select("unit_id, reading_end, reading_date, created_at")
    .eq("building_id", buildingId)
    .eq("utility_type_id", utilityTypeId)
    .gte("reading_date", monthStart)
    .lt("reading_date", nextMonthStart)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function getReadingDefaults(readingDate?: string): Promise<QueryResult<UnitMeterReadingDefaults | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const utilityType = await getUtilityTypeId(supabase);
  if (utilityType.error) return { data: null, error: utilityType.error };
  if (!utilityType.data) return { data: null, error: "Common Water utility type is missing." };

  const active = getActiveReadingMonth();
  const date = readingDate ?? active.start;
  const unitResult = await getCondoUnits();
  if (unitResult.error) return { data: null, error: unitResult.error };
  const firstUnit = unitResult.data[0];

  const prior = firstUnit
    ? await getPriorReadingForUnit(supabase, buildingResult.data.id, utilityType.data.id, firstUnit.id, date)
    : { data: null, error: null };
  if (prior.error) return { data: null, error: prior.error };

  return {
    data: {
      readingMonth: active.label,
      readingMonthKey: active.key,
      previousReading: prior.data?.reading_end ?? null,
      previousReadingDate: prior.data?.reading_date ?? null,
    },
    error: null,
  };
}

export async function getCurrentReadingMonthCompleteness(targetMonthKey?: string): Promise<
  QueryResult<MeterReadingCompletenessSummary | null>
> {
  const startedAt = Date.now();
  const breakdown: CompletenessPerf = {
    utilityTypeMs: 0,
    populationUnitsMs: 0,
    meterReadingsMs: 0,
    totalMs: 0,
  };
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const utilityTypeStarted = Date.now();
  const utilityType = await getUtilityTypeId(supabase);
  breakdown.utilityTypeMs = Date.now() - utilityTypeStarted;
  if (utilityType.error) return { data: null, error: utilityType.error };
  if (!utilityType.data) return { data: null, error: "Common Water utility type is missing." };

  const targetMonth = targetMonthKey ?? previousMonthKeyFromDate(new Date());
  const monthLabel = monthLabelFromKey(targetMonth);
  const populationUnitsStarted = Date.now();
  const unitsResult = await getCondoPopulationFacts();
  breakdown.populationUnitsMs = Date.now() - populationUnitsStarted;
  const meterReadingsStarted = Date.now();
  const readingsResult = await getCurrentMonthReadingsForBuilding(supabase, buildingResult.data.id, utilityType.data.id, targetMonth);
  breakdown.meterReadingsMs = Date.now() - meterReadingsStarted;

  if (unitsResult.error) return { data: null, error: unitsResult.error };
  if (readingsResult.error) return { data: null, error: readingsResult.error };

  const totalExpectedCount = unitsResult.data.length;
  if (totalExpectedCount === 0) {
    return {
      data: {
        monthKey: targetMonth,
        monthLabel,
        completedCount: 0,
        totalExpectedCount: 0,
        percentage: 0,
        incompleteCount: null,
      },
      error: null,
    };
  }

  const completedUnitIds = new Set(
    (readingsResult.data ?? [])
      .filter((reading) => reading.reading_end !== null)
      .map((reading) => reading.unit_id),
  );

  const completedCount = unitsResult.data.filter((unit) => completedUnitIds.has(unit.id)).length;
  const incompleteCount = totalExpectedCount - completedCount;
  breakdown.totalMs = Date.now() - startedAt;
  logCompletenessPerf({ month: targetMonth, breakdown });

  return {
    data: {
      monthKey: targetMonth,
      monthLabel,
      completedCount,
      totalExpectedCount,
      percentage: totalExpectedCount > 0 ? (completedCount / totalExpectedCount) * 100 : 0,
      incompleteCount,
    },
    error: null,
  };
}

export async function getUnitOptions(): Promise<QueryResult<UnitOption[]>> {
  return getCondoUnits();
}

export async function listUnitMeterReadings(
  filters: UnitMeterReadingFilters = {},
  preloadedUnits?: UnitOption[],
): Promise<QueryResult<UnitMeterReadingRow[]>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const utilityType = await getUtilityTypeId(supabase);
  if (utilityType.error) return { data: [], error: utilityType.error };
  if (!utilityType.data) return { data: [], error: "Common Water utility type is missing." };

  const unitResult = preloadedUnits ? { data: preloadedUnits, error: null } : await getCondoUnits();
  if (unitResult.error) return { data: [], error: unitResult.error };

  let request = supabase
    .from("tb810_meter_readings")
    .select(READING_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.data.id);

  if (filters.unitId) request = request.eq("unit_id", filters.unitId);
  if (filters.status && filters.status !== "all") request = request.eq("status", filters.status);
  if (filters.month) {
    const monthStart = parseDate(`${filters.month}-01`);
    if (!monthStart) return { data: [], error: "Invalid month filter." };
    const start = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    request = request.gte("reading_date", start).lte("reading_date", end);
  }

  const { data, error } = await request.order("reading_date", { ascending: false }).order("created_at", {
    ascending: false,
  });
  if (error) return { data: [], error: error.message };

  const unitById = new Map((unitResult.data ?? []).map((unit, index) => [unit.id, { unit, index }]));
  const currentMonthKey = getActiveReadingMonth().key;
  const rows = (data ?? []).map((row) => {
    const unitEntry = unitById.get(row.unit_id);
    const unit = unitEntry?.unit;
    const previousDate = row.reading_start == null ? null : row.reading_date;
    const alertLabel =
      row.consumption != null && row.consumption < 0
        ? "Consumption below previous reading"
        : row.reading_end == null
          ? "Current reading missing"
          : null;
    return {
      ...(row as UnitMeterReadingRecord),
      status: row.status as UnitMeterReadingStatus,
      unit_number: unit?.unit_number ?? "Unknown unit",
      floor: unit?.floor ?? null,
      reading_month_label: monthLabelFromDate(row.reading_date),
      previous_reading: row.reading_start,
      previous_reading_label: readingToText(row.reading_start),
      previous_reading_date: previousDate,
      current_month_editable: monthKeyFromDate(row.reading_date) === currentMonthKey,
      alert_label: alertLabel,
    };
  }).sort((a, b) => {
    const orderA = unitById.get(a.unit_id)?.index ?? Number.MAX_SAFE_INTEGER;
    const orderB = unitById.get(b.unit_id)?.index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.reading_date.localeCompare(b.reading_date);
  });

  const query = (filters.query ?? "").trim().toLowerCase();
  const filtered = query
    ? rows.filter((row) =>
        [row.unit_number, row.reading_date, row.reading_month_label, row.notes ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : rows;

  return { data: filtered, error: null };
}

export async function getUnitMeterReadingById(readingId: string) {
  const result = await listUnitMeterReadings();
  if (result.error) return { data: null, error: result.error };
  return { data: result.data.find((row) => row.id === readingId) ?? null, error: null };
}

function parseNumberValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(date: string) {
  const parsed = parseDate(date);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

async function validateReading(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  input: UnitMeterReadingInput,
  unitNumber: string,
  allowHistoricalEditing: boolean,
  excludeReadingId?: string,
) {
  const active = getActiveReadingMonth();
  const readingDate = normalizeDate(input.reading_date);
  if (!readingDate) return { error: "Reading date is required and must be valid." };
  const readingMonthKey = monthKeyFromDate(readingDate);
  if (!readingMonthKey) return { error: "Reading date is required and must be valid." };
  if (readingMonthKey !== active.key && !allowHistoricalEditing) {
    return { error: "Reading date must belong to the active reading month." };
  }

  const readingEnd = parseNumberValue(input.reading_end);
  if (readingEnd === null || readingEnd < 0) {
    return { error: "Current reading must be zero or greater." };
  }

  const duplicateQuery = supabase
    .from("tb810_meter_readings")
    .select("id")
    .eq("building_id", buildingId)
    .eq("utility_type_id", utilityTypeId)
    .eq("unit_id", input.unit_id)
    .gte("reading_date", monthStartFromKey(readingMonthKey))
    .lt("reading_date", nextMonthStartFromKey(readingMonthKey) ?? monthStartFromKey(readingMonthKey));
  if (excludeReadingId) duplicateQuery.neq("id", excludeReadingId);
  const { data: duplicate } = await duplicateQuery.maybeSingle();
  if (duplicate) {
    return { error: `A water meter reading already exists for Unit ${unitNumber} for ${monthLabelFromKey(readingMonthKey)}.` };
  }

  const prior = await getPriorReadingForUnit(
    supabase,
    buildingId,
    utilityTypeId,
    input.unit_id,
    readingMonthKey,
  );
  if (prior.error) return { error: prior.error };

  const readingStart =
    input.reading_start?.trim() && Number.isFinite(Number(input.reading_start))
      ? Number(input.reading_start)
      : prior.data?.reading_end ?? null;

  if (readingStart !== null && readingEnd < readingStart) {
    return { error: "Current reading must be greater than or equal to previous reading." };
  }

  const consumption = readingStart == null ? null : Number((readingEnd - readingStart).toFixed(3));

  return {
    error: null,
    data: {
      readingDate,
      readingEnd,
      readingStart,
      consumption,
      prior,
      readingMonthKey,
    },
  } as const;
}

export async function createUnitMeterReading(
  input: UnitMeterReadingInput,
  allowHistoricalEditing = false,
) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const utilityType = await getUtilityTypeId(supabase);
  if (utilityType.error) return { data: null as never, error: utilityType.error };
  if (!utilityType.data) return { data: null as never, error: "Common Water utility type is missing." };

  const unitResult = await getCondoUnitById(input.unit_id);
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  if (!unitResult.data) return { data: null as never, error: "Invalid unit." };

  const validated = await validateReading(
    supabase,
    buildingResult.data.id,
    utilityType.data.id,
    input,
    unitResult.data.unit_number,
    allowHistoricalEditing,
  );
  if (validated.error) return { data: null as never, error: validated.error };
  const safe = validated.data!;

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .insert({
      building_id: buildingResult.data.id,
      unit_id: unitResult.data.id,
      utility_type_id: utilityType.data.id,
      reading_date: safe.readingDate,
      reading_start: safe.readingStart,
      reading_end: safe.readingEnd,
      consumption: safe.consumption,
      unit_of_measure: "m3",
      status: input.status,
      notes: input.notes?.trim() || null,
      entered_at: new Date().toISOString(),
    })
    .select(READING_SELECT)
    .single();
  if (error) return { data: null as never, error: error.message };
  await recordDevTestMutation({
    domain: "water",
    recordType: "meter_reading",
    operation: "create",
    recordIdentity: data.id,
  });
  invalidateBuildingMonthFinancialFactsCache(buildingResult.data.id);
  return { data, error: null };
}

export async function updateUnitMeterReading(
  readingId: string,
  input: UnitMeterReadingInput,
  allowHistoricalEditing = false,
) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const utilityType = await getUtilityTypeId(supabase);
  if (utilityType.error) return { data: null as never, error: utilityType.error };
  if (!utilityType.data) return { data: null as never, error: "Common Water utility type is missing." };

  const unitResult = await getCondoUnitById(input.unit_id);
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  if (!unitResult.data) return { data: null as never, error: "Invalid unit." };

  const validated = await validateReading(
    supabase,
    buildingResult.data.id,
    utilityType.data.id,
    input,
    unitResult.data.unit_number,
    allowHistoricalEditing,
    readingId,
  );
  if (validated.error) return { data: null as never, error: validated.error };
  const safe = validated.data!;

  const activeSessionId = await getActiveDevTestSessionId();
  if (activeSessionId) {
    const { data: existingRow, error: existingError } = await supabase
      .from("tb810_meter_readings")
      .select(READING_SELECT)
      .eq("id", readingId)
      .eq("building_id", buildingResult.data.id)
      .eq("utility_type_id", utilityType.data.id)
      .maybeSingle();
    if (existingError) return { data: null as never, error: existingError.message };
    if (existingRow) {
      const journalResult = await recordDevTestMutation({
        domain: "water",
        recordType: "meter_reading",
        operation: "update",
        recordIdentity: readingId,
        beforeState: existingRow as unknown as Record<string, unknown>,
      });
      if (journalResult.error) return { data: null as never, error: journalResult.error };
    }
  }

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .update({
      unit_id: input.unit_id,
      reading_date: safe.readingDate,
      reading_start: safe.readingStart,
      reading_end: safe.readingEnd,
      consumption: safe.consumption,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq("id", readingId)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.data.id)
    .select(READING_SELECT)
    .single();
  if (error) return { data: null as never, error: error.message };
  invalidateBuildingMonthFinancialFactsCache(buildingResult.data.id);
  return { data, error: null };
}

export async function deleteUnitMeterReading(
  readingId: string,
  allowHistoricalEditing = false,
): Promise<QueryResult<UnitMeterReadingDeleteResult>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const utilityType = await getUtilityTypeId(supabase);
  if (utilityType.error) return { data: null as never, error: utilityType.error };
  if (!utilityType.data) return { data: null as never, error: "Common Water utility type is missing." };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) return { data: null as never, error: userError.message };
  if (!userData.user) return { data: null as never, error: "You must be signed in to delete meter readings." };

  const [{ data: canManage, error: roleError }, { data: reading, error: readingError }] = await Promise.all([
    supabase.rpc("has_tb810_role", { role_key: "building_manager" }),
    supabase
      .from("tb810_meter_readings")
      .select(READING_SELECT)
      .eq("id", readingId)
      .eq("building_id", buildingResult.data.id)
      .eq("utility_type_id", utilityType.data.id)
      .maybeSingle(),
  ]);

  if (roleError) return { data: null as never, error: roleError.message };
  if (readingError) return { data: null as never, error: readingError.message };
  if (!canManage) {
    const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("has_tb810_role", {
      role_key: "super_admin",
    });
    if (superAdminError) return { data: null as never, error: superAdminError.message };
    if (!isSuperAdmin) return { data: null as never, error: "You are not authorized to delete meter readings." };
  }

  if (!reading) {
    return { data: null as never, error: "Meter reading not found." };
  }

  const activeSessionId = await getActiveDevTestSessionId();
  if (activeSessionId) {
    const createdBySession = await isRecordCreatedByActiveDevTestSession({
      domain: "water",
      recordType: "meter_reading",
      recordIdentity: readingId,
    });
    if (!createdBySession) {
      return { data: null as never, error: "Delete is disabled during a DEV test session." };
    }
  }

  const active = getActiveReadingMonth();
  if (monthKeyFromDate(reading.reading_date) !== active.key && !allowHistoricalEditing) {
    return { data: null as never, error: "Only current-month meter readings can be deleted." };
  }

  const unitsResult = await getCondoUnits();
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  const unit = unitsResult.data.find((row) => row.id === reading.unit_id);
  if (!unit) {
    return { data: null as never, error: "Meter reading unit is invalid." };
  }

  const { error } = await supabase
    .from("tb810_meter_readings")
    .delete()
    .eq("id", readingId)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.data.id);

  if (error) return { data: null as never, error: error.message };
  invalidateBuildingMonthFinancialFactsCache(buildingResult.data.id);
  return {
    data: { reading: reading as UnitMeterReadingRecord, readingMonthKey: active.key, unit_number: unit.unit_number },
    error: null,
  };
}
