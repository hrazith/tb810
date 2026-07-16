import { createClient } from "@/lib/supabase/server";
import { getUnitById } from "@/server/units";
import type { UnitTypeCode } from "@/server/units/types";

import {
  firstDayOfNextMonth,
  ownershipTransferSchema,
} from "./validation";
import type {
  OwnershipRecord,
  OwnershipTransferDefaults,
  OwnershipTransferInput,
  OwnershipWithRelations,
  OwnerUnitSummary,
  OwnerUnitsSnapshot,
  UnitAccountSummary,
  UnitOwnershipSnapshot,
} from "./types";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

const OWNERSHIP_SELECT =
  "id, owner_id, unit_id, start_date, end_date, notes, legacy_table, legacy_id, legacy_metadata, created_at, updated_at" as const;

function mapOwnershipRow(row: OwnershipRecord): OwnershipRecord {
  return row;
}

async function getUnitLookup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
) {
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, unit_type_id")
    .eq("id", unitId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const { data: unitType, error: unitTypeError } = await supabase
    .from("tb810_unit_types")
    .select("code, name")
    .eq("id", data.unit_type_id)
    .maybeSingle();

  if (unitTypeError) return { data: null, error: unitTypeError.message };
  if (!unitType) return { data: null, error: null };

  return {
    data: {
      id: data.id,
      unit_number: data.unit_number,
      unit_type_code: unitType.code as UnitTypeCode,
      unit_type_name: unitType.name,
    },
    error: null,
  };
}

async function getUnitAccountSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
): Promise<QueryResult<UnitAccountSummary | null>> {
  const { data, error } = await supabase
    .from("tb810_unit_accounts")
    .select("id, account_number, status, current_balance, credit_balance")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: true })
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}

async function getOwnerMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerIds: string[],
) {
  if (ownerIds.length === 0) {
    return { data: new Map<string, OwnershipWithRelations["owner"]>(), error: null };
  }

  const { data, error } = await supabase
    .from("tb810_owners")
    .select("id, full_name, owner_reference, active")
    .in("id", ownerIds);

  if (error) return { data: null, error: error.message };

  return {
    data: new Map(
      (data ?? []).map((owner) => [
        owner.id,
        {
          id: owner.id,
          full_name: owner.full_name,
          owner_reference: owner.owner_reference,
          active: owner.active,
        },
      ]),
    ),
    error: null,
  };
}

async function getUnitMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitIds: string[],
) {
  if (unitIds.length === 0) {
    return { data: new Map<string, { unit_number: string; unit_type_code: UnitTypeCode; unit_type_name: string }>(), error: null };
  }

  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, unit_type_id")
    .in("id", unitIds);

  if (error) return { data: null, error: error.message };

  const unitTypeIds = Array.from(new Set((data ?? []).map((row) => row.unit_type_id)));
  const { data: unitTypes, error: unitTypeError } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name")
    .in("id", unitTypeIds);

  if (unitTypeError) return { data: null, error: unitTypeError.message };

  const unitTypeMap = new Map(
    (unitTypes ?? []).map((unitType) => [
      unitType.id,
      { code: unitType.code as UnitTypeCode, name: unitType.name },
    ]),
  );

  return {
    data: new Map(
      (data ?? []).map((unit) => {
        const unitType = unitTypeMap.get(unit.unit_type_id);
        return [
          unit.id,
          {
            unit_number: unit.unit_number,
            unit_type_code: unitType?.code ?? "condo",
            unit_type_name: unitType?.name ?? "Unit",
          },
        ] as const;
      }),
    ),
    error: null,
  };
}

function mapOwnershipWithRelations(
  row: OwnershipRecord,
  owner: OwnershipWithRelations["owner"],
  unit: { unit_number: string; unit_type_code: UnitTypeCode; unit_type_name: string },
): OwnershipWithRelations {
  return {
    ...mapOwnershipRow(row),
    owner,
    unit_number: unit.unit_number,
    unit_type_code: unit.unit_type_code,
    unit_type_name: unit.unit_type_name,
  };
}

export async function getCurrentOwnershipForUnit(
  unitId: string,
): Promise<QueryResult<OwnershipWithRelations | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("unit_id", unitId)
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const [{ data: ownerMap, error: ownerError }, { data: unitMap, error: unitError }] =
    await Promise.all([
      getOwnerMap(supabase, [data.owner_id]),
      getUnitMap(supabase, [data.unit_id]),
    ]);

  if (ownerError) return { data: null, error: ownerError };
  if (unitError) return { data: null, error: unitError };

  if (!ownerMap || !unitMap) {
    return { data: null, error: null };
  }

  const owner = ownerMap.get(data.owner_id);
  const unit = unitMap.get(data.unit_id);

  if (!owner || !unit) return { data: null, error: null };

  return { data: mapOwnershipWithRelations(data, owner, unit), error: null };
}

export async function getOwnershipHistoryForUnit(
  unitId: string,
): Promise<QueryResult<OwnershipWithRelations[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("unit_id", unitId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };

  const ownerIds = [...new Set((data ?? []).map((row) => row.owner_id))];
  const { data: ownerMap, error: ownerError } = await getOwnerMap(supabase, ownerIds);
  if (ownerError) return { data: [], error: ownerError };

  const { data: unitMap, error: unitError } = await getUnitMap(supabase, [unitId]);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  if (!ownerMap) return { data: [], error: null };

  const unit = unitMap.get(unitId);
  if (!unit) return { data: [], error: null };

  return {
    data: (data ?? [])
      .map((row) => {
        const owner = ownerMap.get(row.owner_id);
        return owner ? mapOwnershipWithRelations(row, owner, unit) : null;
      })
      .filter(Boolean) as OwnershipWithRelations[],
    error: null,
  };
}

export async function getUnitOwnershipSnapshot(
  unitId: string,
): Promise<QueryResult<UnitOwnershipSnapshot | null>> {
  const supabase = await createClient();
  const [currentResult, historyResult, accountResult] = await Promise.all([
    getCurrentOwnershipForUnit(unitId),
    getOwnershipHistoryForUnit(unitId),
    getUnitAccountSummary(supabase, unitId),
  ]);

  if (currentResult.error) return { data: null, error: currentResult.error };
  if (historyResult.error) return { data: null, error: historyResult.error };
  if (accountResult.error) return { data: null, error: accountResult.error };

  return {
    data: {
      currentOwnership: currentResult.data,
      ownershipHistory: historyResult.data,
      unitAccount: accountResult.data,
    },
    error: null,
  };
}

export async function getCurrentUnitsForOwner(
  ownerId: string,
): Promise<QueryResult<OwnerUnitSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("owner_id", ownerId)
    .is("end_date", null)
    .order("start_date", { ascending: false });

  if (error) return { data: [], error: error.message };

  const unitIds = [...new Set((data ?? []).map((row) => row.unit_id))];
  const { data: unitMap, error: unitError } = await getUnitMap(supabase, unitIds);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  return {
    data: (data ?? [])
      .map((row) => {
        const unit = unitMap.get(row.unit_id);
        if (!unit) return null;
        return {
          unit_id: row.unit_id,
          unit_number: unit.unit_number,
          unit_type_code: unit.unit_type_code,
          unit_type_name: unit.unit_type_name,
          ownership_start_date: row.start_date,
          ownership_end_date: row.end_date,
          ownership_status: "current" as const,
        };
      })
      .filter(Boolean) as OwnerUnitSummary[],
    error: null,
  };
}

export async function getPastUnitsForOwner(
  ownerId: string,
): Promise<QueryResult<OwnerUnitSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("owner_id", ownerId)
    .not("end_date", "is", null)
    .order("end_date", { ascending: false });

  if (error) return { data: [], error: error.message };

  const unitIds = [...new Set((data ?? []).map((row) => row.unit_id))];
  const { data: unitMap, error: unitError } = await getUnitMap(supabase, unitIds);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  return {
    data: (data ?? [])
      .map((row) => {
        const unit = unitMap.get(row.unit_id);
        if (!unit) return null;
        return {
          unit_id: row.unit_id,
          unit_number: unit.unit_number,
          unit_type_code: unit.unit_type_code,
          unit_type_name: unit.unit_type_name,
          ownership_start_date: row.start_date,
          ownership_end_date: row.end_date,
          ownership_status: "past" as const,
        };
      })
      .filter(Boolean) as OwnerUnitSummary[],
    error: null,
  };
}

export async function getOwnerUnitsSnapshot(
  ownerId: string,
): Promise<QueryResult<OwnerUnitsSnapshot>> {
  const [currentUnits, pastUnits] = await Promise.all([
    getCurrentUnitsForOwner(ownerId),
    getPastUnitsForOwner(ownerId),
  ]);

  if (currentUnits.error) return { data: null as never, error: currentUnits.error };
  if (pastUnits.error) return { data: null as never, error: pastUnits.error };

  return {
    data: {
      currentUnits: currentUnits.data,
      pastUnits: pastUnits.data,
    },
    error: null,
  };
}

export async function getTransferDefaults(
  unitId: string,
): Promise<QueryResult<OwnershipTransferDefaults | null>> {
  const supabase = await createClient();
  const [unitLookup, snapshot, ownersResult] = await Promise.all([
    getUnitById(unitId),
    getUnitOwnershipSnapshot(unitId),
    supabase
      .from("tb810_owners")
      .select("id, full_name, owner_reference, active")
      .eq("active", true)
      .order("full_name", { ascending: true }),
  ]);

  if (unitLookup.error) return { data: null, error: unitLookup.error };
  if (snapshot.error) return { data: null, error: snapshot.error };
  if (ownersResult.error) return { data: null, error: ownersResult.error.message };
  if (!unitLookup.data) return { data: null, error: null };

  return {
    data: {
      unit: unitLookup.data,
      unitAccount: snapshot.data?.unitAccount ?? null,
      currentOwnership: snapshot.data?.currentOwnership ?? null,
      owners: ownersResult.data ?? [],
      suggestedStartDate: firstDayOfNextMonth(),
    },
    error: null,
  };
}

export async function transferOwnership(
  input: OwnershipTransferInput,
): Promise<QueryResult<OwnershipRecord>> {
  const supabase = await createClient();
  try {
    const parsed = ownershipTransferSchema.safeParse(input);

    if (!parsed.success) {
      console.error("Ownership transfer domain validation failed", {
        issues: parsed.error.issues,
        format: parsed.error.format(),
      });
      return {
        data: null as never,
        error:
          parsed.error.issues.map((issue) => issue.message).join("; ") ||
          "Validation failed.",
      };
    }

    const rpcArgs = {
      p_unit_id: parsed.data.unit_id,
      p_owner_id: parsed.data.owner_id,
      p_start_date: parsed.data.effective_date,
      p_notes: parsed.data.notes ?? undefined,
    };

    const { data, error } = await supabase.rpc("tb810_transfer_ownership", rpcArgs);

    if (error) {
      console.error("Ownership transfer RPC error", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        name: error.name,
      });
      return {
        data: null as never,
        error: `${error.message}${error.details ? ` | details: ${error.details}` : ""}${error.hint ? ` | hint: ${error.hint}` : ""}${error.code ? ` | code: ${error.code}` : ""}`,
      };
    }

    return { data: data as OwnershipRecord, error: null };
  } catch (error) {
    console.error("Ownership transfer RPC exception", {
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
