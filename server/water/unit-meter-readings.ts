import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding, listUnitTypes, listUnits } from "@/server/units";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

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
  status: "recorded" | "reviewed" | "approved" | "void";
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
  unit_type_name: string;
  previous_reading_label: string;
  reading_month_label: string;
};

export type UnitMeterReadingFilters = {
  query?: string;
  unitId?: string;
  status?: "all" | UnitMeterReadingRecord["status"];
  month?: string;
};

export type UnitMeterReadingInput = {
  unit_id: string;
  reading_date: string;
  reading_end: string;
  reading_start?: string;
  status: UnitMeterReadingRecord["status"];
  notes?: string;
};

type UnitOptions = {
  id: string;
  unit_number: string;
  floor: string | null;
};

const READING_SELECT =
  "id, building_id, unit_id, utility_type_id, reading_date, reading_start, reading_end, consumption, unit_of_measure, status, notes, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, entered_by, entered_at, created_at, updated_at" as const;

function parseReadingDate(readingDate: string) {
  const parsed = new Date(`${readingDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatReadingMonth(readingDate: string) {
  const parsed = parseReadingDate(readingDate);
  if (!parsed) return readingDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function monthKey(readingDate: string) {
  const parsed = parseReadingDate(readingDate);
  if (!parsed) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function getUnitTypeId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", "common_water")
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Common Water utility type is missing." };
  return { data, error: null };
}

async function getCondoUnits() {
  const [{ data: unitTypes, error: unitTypesError }, unitsResult] = await Promise.all([
    listUnitTypes(),
    listUnits(),
  ]);
  if (unitTypesError) return { data: null, error: unitTypesError };
  const condoType = unitTypes.find((unitType) => unitType.code === "condo");
  if (!condoType) return { data: null, error: "Condo unit type is missing." };
  const units = (unitsResult.data ?? [])
    .filter((unit) => unit.unit_type_code === condoType.code)
    .map((unit) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      floor: unit.floor,
    }));
  return { data: units, error: unitsResult.error };
}

export async function listUnitMeterReadings(
  filters: UnitMeterReadingFilters = {},
): Promise<QueryResult<UnitMeterReadingRow[]>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const [{ data: utilityType, error: utilityTypeError }, unitsResult] = await Promise.all([
    getUnitTypeId(supabase),
    getCondoUnits(),
  ]);
  if (utilityTypeError) return { data: [], error: utilityTypeError };
  if (unitsResult.error) return { data: [], error: unitsResult.error };
  if (!utilityType) return { data: [], error: "Common Water utility type is missing." };

  let request = supabase
    .from("tb810_meter_readings")
    .select(READING_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id);

  if (filters.unitId) request = request.eq("unit_id", filters.unitId);
  if (filters.status && filters.status !== "all") request = request.eq("status", filters.status);
  if (filters.month) {
    const parsed = parseReadingDate(`${filters.month}-01`);
    if (!parsed) return { data: [], error: "Invalid month filter." };
    const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
    request = request.gte("reading_date", start.toISOString().slice(0, 10)).lte(
      "reading_date",
      end.toISOString().slice(0, 10),
    );
  }

  const { data, error } = await request.order("reading_date", { ascending: false }).order("created_at", {
    ascending: false,
  });
  if (error) return { data: [], error: error.message };

  const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit]));
  const rows = (data ?? []).map((row) => {
    const unit = unitById.get(row.unit_id);
    return {
      ...row,
      status: row.status as UnitMeterReadingRecord["status"],
      unit_number: unit?.unit_number ?? "Unknown unit",
      floor: unit?.floor ?? null,
      unit_type_name: "Condo",
      previous_reading_label: row.reading_start == null ? "—" : row.reading_start.toFixed(3).replace(/\.?0+$/, ""),
      reading_month_label: formatReadingMonth(row.reading_date),
    };
  });

  const query = (filters.query ?? "").trim().toLowerCase();
  const filtered = query
    ? rows.filter((row) =>
        [
          row.unit_number,
          row.reading_date,
          row.reading_month_label,
          row.status,
          row.notes ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : rows;

  return { data: filtered, error: null };
}

export async function getUnitMeterReadingById(
  readingId: string,
): Promise<QueryResult<UnitMeterReadingRow | null>> {
  const result = await listUnitMeterReadings();
  if (result.error) return { data: null, error: result.error };
  return { data: result.data.find((row) => row.id === readingId) ?? null, error: null };
}

export async function getUnitOptions(): Promise<QueryResult<UnitOptions[]>> {
  const units = await getCondoUnits();
  if (units.error) return { data: [], error: units.error };
  return { data: units.data ?? [], error: null };
}

export async function getReadingDefaults(readingDate?: string) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };
  const supabase = await createClient();
  const utilityType = await getUnitTypeId(supabase);
  if (utilityType.error) return { data: null, error: utilityType.error };
  if (!utilityType.data) return { data: null, error: "Common Water utility type is missing." };

  let request = supabase
    .from("tb810_meter_readings")
    .select("reading_end, reading_date, unit_id, created_at")
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.data.id);
  if (readingDate) {
    request = request.lt("reading_date", readingDate);
  }

  const { data, error } = await request.order("reading_date", { ascending: false }).order("created_at", {
    ascending: false,
  }).limit(1).maybeSingle();
  if (error) return { data: null, error: error.message };
  return {
    data: {
      previousReading: data?.reading_end ?? null,
      previousDate: data?.reading_date ?? null,
    },
    error: null,
  };
}

function parseNumberValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createUnitMeterReading(input: UnitMeterReadingInput) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const [{ data: utilityType, error: utilityTypeError }, unitsResult] = await Promise.all([
    getUnitTypeId(supabase),
    getCondoUnits(),
  ]);
  if (utilityTypeError) return { data: null as never, error: utilityTypeError };
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  if (!utilityType) return { data: null as never, error: "Common Water utility type is missing." };

  const unit = (unitsResult.data ?? []).find((row) => row.id === input.unit_id);
  if (!unit) return { data: null as never, error: "Invalid unit." };

  const readingDate = parseReadingDate(input.reading_date);
  if (!readingDate) return { data: null as never, error: "Invalid reading date." };

  const reading_end = parseNumberValue(input.reading_end);
  if (reading_end === null || reading_end < 0) {
    return { data: null as never, error: "Reading value must be zero or greater." };
  }

  let reading_start = parseNumberValue(input.reading_start ?? "");
  if (reading_start === null) {
    const defaults = await getReadingDefaults(input.reading_date);
    if (defaults.error) return { data: null as never, error: defaults.error };
    reading_start = defaults.data?.previousReading ?? null;
  }

  if (reading_start !== null && reading_end < reading_start) {
    return { data: null as never, error: "Current reading must be greater than or equal to previous reading." };
  }

  const consumption =
    reading_start === null ? null : Number((reading_end - reading_start).toFixed(3));

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .insert({
      building_id: buildingResult.data.id,
      unit_id: unit.id,
      utility_type_id: utilityType.id,
      reading_date: readingDate.toISOString().slice(0, 10),
      reading_start,
      reading_end,
      consumption,
      unit_of_measure: "m3",
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .select(READING_SELECT)
    .single();

  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function updateUnitMeterReading(readingId: string, input: UnitMeterReadingInput) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const supabase = await createClient();
  const [{ data: utilityType, error: utilityTypeError }, unitsResult] = await Promise.all([
    getUnitTypeId(supabase),
    getCondoUnits(),
  ]);
  if (utilityTypeError) return { data: null as never, error: utilityTypeError };
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  if (!utilityType) return { data: null as never, error: "Common Water utility type is missing." };
  const unit = (unitsResult.data ?? []).find((row) => row.id === input.unit_id);
  if (!unit) return { data: null as never, error: "Invalid unit." };

  const readingDate = parseReadingDate(input.reading_date);
  if (!readingDate) return { data: null as never, error: "Invalid reading date." };

  const reading_end = parseNumberValue(input.reading_end);
  if (reading_end === null || reading_end < 0) {
    return { data: null as never, error: "Reading value must be zero or greater." };
  }

  let reading_start = parseNumberValue(input.reading_start ?? "");
  if (reading_start === null) {
    const defaults = await getReadingDefaults(input.reading_date);
    if (defaults.error) return { data: null as never, error: defaults.error };
    reading_start = defaults.data?.previousReading ?? null;
  }

  if (reading_start !== null && reading_end < reading_start) {
    return { data: null as never, error: "Current reading must be greater than or equal to previous reading." };
  }

  const consumption =
    reading_start === null ? null : Number((reading_end - reading_start).toFixed(3));

  const { data, error } = await supabase
    .from("tb810_meter_readings")
    .update({
      unit_id: unit.id,
      reading_date: readingDate.toISOString().slice(0, 10),
      reading_start,
      reading_end,
      consumption,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq("id", readingId)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .select(READING_SELECT)
    .single();

  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function deleteUnitMeterReading(readingId: string) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };
  const supabase = await createClient();
  const utilityType = await getUnitTypeId(supabase);
  if (utilityType.error) return { data: null as never, error: utilityType.error };
  if (!utilityType.data) return { data: null as never, error: "Common Water utility type is missing." };

  const { error } = await supabase
    .from("tb810_meter_readings")
    .delete()
    .eq("id", readingId)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.data.id);

  if (error) return { data: null as never, error: error.message };
  return { data: true, error: null };
}
