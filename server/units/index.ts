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

  const unitIds = (data ?? []).map((row) => row.id);
  const currentOwnerByUnitId = new Map<
    string,
    { id: string; full_name: string; owner_reference: string }
  >();

  if (unitIds.length > 0) {
    const { data: ownerships, error: ownershipError } = await supabase
      .from("tb810_ownerships")
      .select("unit_id, owner_id")
      .in("unit_id", unitIds)
      .is("end_date", null);

    if (ownershipError) {
      return { data: [], error: ownershipError.message };
    }

    const ownerIds = [...new Set((ownerships ?? []).map((row) => row.owner_id))];
    if (ownerIds.length > 0) {
      const { data: owners, error: ownerError } = await supabase
        .from("tb810_owners")
        .select("id, full_name, owner_reference")
        .in("id", ownerIds);

      if (ownerError) {
        return { data: [], error: ownerError.message };
      }

      const ownerById = new Map(
        (owners ?? []).map((owner) => [
          owner.id,
          {
            id: owner.id,
            full_name: owner.full_name,
            owner_reference: owner.owner_reference,
          },
        ]),
      );

      for (const ownership of ownerships ?? []) {
        const owner = ownerById.get(ownership.owner_id);
        if (owner) {
          currentOwnerByUnitId.set(ownership.unit_id, owner);
        }
      }
    }
  }

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
        const currentOwner = currentOwnerByUnitId.get(row.id) ?? null;
        return {
          ...row,
          unit_type_name: unitType.name,
          unit_type_code: unitType.code,
          current_owner_id: currentOwner?.id ?? null,
          current_owner_name: currentOwner?.full_name ?? null,
          current_owner_reference: currentOwner?.owner_reference ?? null,
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

export async function updateUnit(
  unitId: string,
  input: UnitInput,
): Promise<QueryResult<UnitRecord>> {
  const supabase = await createClient();
  const payload = input;
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

export async function getUnitFormDefaults(
  unitId?: string,
): Promise<QueryResult<UnitFormDefaults>> {
  const [buildingResult, unitTypesResult, unitResult] = await Promise.all([
    getCurrentBuilding(),
    listUnitTypes(),
    unitId ? getUnitById(unitId) : Promise.resolve({ data: null, error: null }),
  ]);

  if (buildingResult.error) {
    return { data: null as never, error: buildingResult.error };
  }

  if (unitTypesResult.error) {
    return { data: null as never, error: unitTypesResult.error };
  }

  if (unitResult.error) {
    return { data: null as never, error: unitResult.error };
  }

  const building = buildingResult.data;
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
      buildings: building ? [building] : [],
      unitTypes: unitTypesResult.data,
    },
    error: null,
  };
}
