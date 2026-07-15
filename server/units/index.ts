import { createClient } from "@/lib/supabase/server";

import type {
  BuildingRecord,
  UnitDetail,
  UnitFilters,
  UnitFormDefaults,
  UnitInput,
  UnitListItem,
  UnitRecord,
  UnitTypeRecord,
} from "./types";
import { unitInputSchema } from "./validation";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

const UNIT_SELECT =
  "id, building_id, unit_type_id, unit_number, floor, registered_area_m2, participation_percentage, has_meter, notes, active, created_at, updated_at" as const;

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function mapUnitType(row: {
  id: string;
  code: UnitTypeRecord["code"];
  name: string;
  sort_order: number;
}): UnitTypeRecord {
  return row;
}

function mapBuilding(row: { id: string; name: string }): BuildingRecord {
  return row;
}

export async function listUnitTypes(): Promise<QueryResult<UnitTypeRecord[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapUnitType), error: null };
}

export async function listBuildings(): Promise<QueryResult<BuildingRecord[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_buildings")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapBuilding), error: null };
}

export async function getCurrentBuilding(): Promise<QueryResult<BuildingRecord | null>> {
  const buildings = await listBuildings();
  if (buildings.error) return { data: null, error: buildings.error };
  return { data: buildings.data[0] ?? null, error: null };
}

export async function listUnits(
  filters: UnitFilters = {},
): Promise<QueryResult<UnitListItem[]>> {
  const supabase = await createClient();
  const query = normalizeText(filters.query).toLowerCase();

  let request = supabase
    .from("tb810_units")
    .select(UNIT_SELECT)
    .order("unit_number", { ascending: true });

  if (filters.unitTypeId) {
    request = request.eq("unit_type_id", filters.unitTypeId);
  }

  if (filters.status === "active") {
    request = request.eq("active", true);
  } else if (filters.status === "inactive") {
    request = request.eq("active", false);
  }

  const { data, error } = await request;
  if (error) return { data: [], error: error.message };

  const { data: unitTypes, error: unitTypeError } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name, sort_order");

  if (unitTypeError) {
    return { data: [], error: unitTypeError.message };
  }

  const unitTypeById = new Map(
    (unitTypes ?? []).map((unitType) => [
      unitType.id,
      {
        code: unitType.code,
        name: unitType.name,
      },
    ]),
  );

  return {
    data: (data ?? [])
      .map((row) => {
        const unitType = unitTypeById.get(row.unit_type_id);
        if (!unitType) return null;
        if (
          query &&
          ![
            row.unit_number,
            row.floor ?? "",
            unitType.name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)
        ) {
          return null;
        }
        return {
          ...row,
          unit_type_name: unitType.name,
          unit_type_code: unitType.code,
        };
      })
      .filter(Boolean) as UnitListItem[],
    error: null,
  };
}

export async function getUnitById(unitId: string): Promise<QueryResult<UnitDetail | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_units")
    .select(UNIT_SELECT)
    .eq("id", unitId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const [{ data: unitType, error: unitTypeError }, { data: building, error: buildingError }] = await Promise.all([
    supabase
      .from("tb810_unit_types")
      .select("id, code, name, sort_order")
      .eq("id", data.unit_type_id)
      .maybeSingle(),
    supabase
      .from("tb810_buildings")
      .select("id, name")
      .eq("id", data.building_id)
      .maybeSingle(),
  ]);

  if (unitTypeError) return { data: null, error: unitTypeError.message };
  if (buildingError) return { data: null, error: buildingError.message };
  if (!unitType || !building) return { data: null, error: null };

  return {
    data: {
      ...data,
      unit_type_name: unitType.name,
      unit_type_code: unitType.code,
      building_name: building.name,
    },
    error: null,
  };
}

export async function createUnit(
  input: UnitInput,
): Promise<QueryResult<UnitRecord>> {
  const supabase = await createClient();
  const parsed = unitInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null as never, error: parsed.error.issues[0]?.message ?? "Invalid unit input" };
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from("tb810_units")
    .insert({
      building_id: payload.building_id,
      unit_type_id: payload.unit_type_id,
      unit_number: payload.unit_number,
      floor: payload.floor,
      registered_area_m2: payload.registered_area_m2,
      participation_percentage: payload.participation_percentage,
      has_meter: payload.has_meter,
      notes: payload.notes,
      active: true,
    })
    .select(UNIT_SELECT)
    .single();

  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function updateUnit(
  unitId: string,
  input: UnitInput,
): Promise<QueryResult<UnitRecord>> {
  const supabase = await createClient();
  const parsed = unitInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null as never, error: parsed.error.issues[0]?.message ?? "Invalid unit input" };
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from("tb810_units")
    .update({
      building_id: payload.building_id,
      unit_type_id: payload.unit_type_id,
      unit_number: payload.unit_number,
      floor: payload.floor,
      registered_area_m2: payload.registered_area_m2,
      participation_percentage: payload.participation_percentage,
      has_meter: payload.has_meter,
      notes: payload.notes,
    })
    .eq("id", unitId)
    .select(UNIT_SELECT)
    .single();

  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function archiveUnit(
  unitId: string,
): Promise<QueryResult<UnitRecord>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_units")
    .update({ active: false })
    .eq("id", unitId)
    .select(UNIT_SELECT)
    .single();

  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function getUnitFormDefaults(
  unitId?: string,
): Promise<QueryResult<UnitFormDefaults>> {
  const [buildingsResult, unitTypesResult, unitResult] = await Promise.all([
    listBuildings(),
    listUnitTypes(),
    unitId ? getUnitById(unitId) : Promise.resolve({ data: null, error: null }),
  ]);

  if (buildingsResult.error) {
    return { data: null as never, error: buildingsResult.error };
  }

  if (unitTypesResult.error) {
    return { data: null as never, error: unitTypesResult.error };
  }

  if (unitResult.error) {
    return { data: null as never, error: unitResult.error };
  }

  const building = buildingsResult.data[0] ?? null;
  const values = unitResult.data
    ? {
        building_id: unitResult.data.building_id,
        unit_type_id: unitResult.data.unit_type_id,
        unit_number: unitResult.data.unit_number,
        floor: unitResult.data.floor ?? "",
        registered_area_m2: unitResult.data.registered_area_m2 ?? undefined,
        participation_percentage: unitResult.data.participation_percentage,
        has_meter: unitResult.data.has_meter,
        notes: unitResult.data.notes ?? "",
      }
    : building
      ? {
          building_id: building.id,
          unit_type_id: unitTypesResult.data[0]?.id ?? "",
          unit_number: "",
          floor: "",
          registered_area_m2: undefined,
          participation_percentage: 0,
          has_meter: false,
          notes: "",
        }
      : {
          building_id: "",
          unit_type_id: "",
          unit_number: "",
          floor: "",
          registered_area_m2: undefined,
          participation_percentage: 0,
          has_meter: false,
          notes: "",
        };

  return {
    data: {
      values,
      building,
      buildings: buildingsResult.data,
      unitTypes: unitTypesResult.data,
      showBuildingSelector: buildingsResult.data.length > 1,
    },
    error: null,
  };
}
