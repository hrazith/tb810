import { createClient } from "@/lib/supabase/server";
import { isPerfLoggingEnabled } from "@/server/perf";
import type { UnitTypeCode } from "@/server/units/types";
import { getUnitById } from "@/server/units";
import { invalidateUnitDirectoryCache } from "@/server/units/cache";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";

import {
  getCurrentBillingMonth,
  ownershipTransferSchema,
} from "./validation";
import { classifyOwnershipRow } from "./classification";
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

async function getOwnerMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerIds: string[],
): Promise<QueryResult<Map<string, {
  id: string;
  full_name: string;
  owner_reference: string;
  active: boolean;
}> | null>> {
  if (ownerIds.length === 0) return { data: new Map(), error: null };

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
): Promise<QueryResult<Map<string, {
  unit_number: string;
  unit_type_code: UnitTypeCode;
  unit_type_name: string;
}> | null>> {
  if (unitIds.length === 0) return { data: new Map(), error: null };

  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, tb810_unit_types!tb810_units_unit_type_id_fkey(code, name)")
    .in("id", unitIds);

  if (error) return { data: null, error: error.message };

  return {
    data: new Map(
      (data ?? []).map((unit) => [
        unit.id,
        {
          unit_number: unit.unit_number,
          unit_type_code: ((unit as unknown as { tb810_unit_types?: { code: UnitTypeCode } | null }).tb810_unit_types?.code ?? "condo") as UnitTypeCode,
          unit_type_name: ((unit as unknown as { tb810_unit_types?: { name: string } | null }).tb810_unit_types?.name ?? "Unit"),
        },
      ]),
    ),
    error: null,
  };
}

type SelectedUnitOwnershipSnapshotFacts = {
  ownershipRows: Array<
    OwnershipRecord & {
      owner: {
        id: string;
        full_name: string;
        owner_reference: string;
        active: boolean;
      } | null;
    }
  >;
  unitAccount: UnitAccountSummary | null;
};

export function buildSelectedUnitOwnershipSnapshotFromFacts(
  facts: SelectedUnitOwnershipSnapshotFacts,
  unit: {
    id: string;
    unit_number: string;
    unit_type_code: UnitTypeCode;
    unit_type_name?: string | null;
  },
  currentMonth: string = getCurrentBillingMonth(),
): UnitOwnershipSnapshot {
  const ownershipHistory = facts.ownershipRows
    .map((row) => {
      if (!row.owner) return null;
      return mapOwnershipWithRelations(
        row,
        row.owner,
        {
          unit_number: unit.unit_number,
          unit_type_code: unit.unit_type_code,
          unit_type_name: unit.unit_type_name ?? "Unit",
        },
        classifyOwnershipRow(row, currentMonth),
      );
    })
    .filter(Boolean) as OwnershipWithRelations[];

  return {
    currentOwnership: ownershipHistory.find((row) => row.ownership_status === "current") ?? null,
    scheduledOwnerships: ownershipHistory.filter((row) => row.ownership_status === "scheduled"),
    ownershipHistory,
    unitAccount: facts.unitAccount,
  };
}


function mapOwnershipWithRelations(
  row: OwnershipRecord,
  owner: OwnershipWithRelations["owner"],
  unit: { unit_number: string; unit_type_code: UnitTypeCode; unit_type_name: string },
  ownership_status: OwnershipWithRelations["ownership_status"],
): OwnershipWithRelations {
  return {
    ...mapOwnershipRow(row),
    owner,
    unit_number: unit.unit_number,
    unit_type_code: unit.unit_type_code,
    unit_type_name: unit.unit_type_name,
    ownership_status,
  };
}

async function getOwnershipRowsForUnit(
  unitId: string,
): Promise<QueryResult<OwnershipRecord[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("unit_id", unitId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as OwnershipRecord[], error: null };
}

export async function getOwnershipHistoryForUnit(
  unitId: string,
): Promise<QueryResult<OwnershipWithRelations[]>> {
  const supabase = await createClient();
  const [rowsResult, currentMonthResult] = await Promise.all([
    getOwnershipRowsForUnit(unitId),
    Promise.resolve(getCurrentBillingMonth()),
  ]);

  if (rowsResult.error) return { data: [], error: rowsResult.error };

  const ownerIds = [...new Set((rowsResult.data ?? []).map((row) => row.owner_id))];
  const { data: ownerMap, error: ownerError } = await getOwnerMap(supabase, ownerIds);
  if (ownerError) return { data: [], error: ownerError };

  const { data: unitMap, error: unitError } = await getUnitMap(supabase, [unitId]);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  if (!ownerMap) return { data: [], error: null };

  const unit = unitMap.get(unitId);
  if (!unit) return { data: [], error: null };

  return {
    data: (rowsResult.data ?? [])
      .map((row) => {
        const owner = ownerMap.get(row.owner_id);
        return owner
          ? mapOwnershipWithRelations(
              row,
              owner,
              unit,
              classifyOwnershipRow(row, currentMonthResult),
            )
          : null;
      })
      .filter(Boolean) as OwnershipWithRelations[],
    error: null,
  };
}

async function loadSelectedUnitOwnershipSnapshotFacts(
  unitId: string,
): Promise<QueryResult<SelectedUnitOwnershipSnapshotFacts | null>> {
  const supabase = await createClient();
  const rpc = await (supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("tb810_get_unit_ownership_account_snapshot", {
    p_unit_id: unitId,
  });

  if (rpc.error) return { data: null, error: rpc.error.message };
  const payload = (rpc.data ?? null) as SelectedUnitOwnershipSnapshotFacts | null;
  if (!payload) return { data: null, error: "Unit ownership/account snapshot unavailable." };
  return { data: payload, error: null };
}

export async function getSelectedUnitOwnershipSnapshot(input: {
  unit: {
    id: string;
    unit_number: string;
    unit_type_code: UnitTypeCode;
    unit_type_name?: string | null;
  };
}): Promise<QueryResult<UnitOwnershipSnapshot | null>> {
  const startedAt = process.hrtime.bigint();
  const factsResult = await loadSelectedUnitOwnershipSnapshotFacts(input.unit.id);
  if (factsResult.error) return { data: null, error: factsResult.error };
  if (!factsResult.data) return { data: null, error: "Unit ownership/account snapshot unavailable." };

  const snapshot = buildSelectedUnitOwnershipSnapshotFromFacts(
    factsResult.data,
    input.unit,
  );

  if (isPerfLoggingEnabled()) {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      [
        "[SELECTED_UNIT_OWNERSHIP_PERF]",
        `unit=${input.unit.id}`,
        `data_remote_requests=1`,
        `elapsed_ms=${elapsedMs.toFixed(1)}`,
      ].join(" "),
    );
  }

  return {
    data: snapshot,
    error: null,
  };
}

export async function getUnitOwnershipSnapshot(
  unitId: string,
): Promise<QueryResult<UnitOwnershipSnapshot | null>> {
  const unitResult = await getUnitById(unitId);
  if (unitResult.error) return { data: null, error: unitResult.error };
  if (!unitResult.data) return { data: null, error: null };

  const factsResult = await loadSelectedUnitOwnershipSnapshotFacts(unitId);
  if (factsResult.error) return { data: null, error: factsResult.error };
  if (!factsResult.data) return { data: null, error: "Unit ownership/account snapshot unavailable." };

  return {
    data: buildSelectedUnitOwnershipSnapshotFromFacts(factsResult.data, {
      id: unitResult.data.id,
      unit_number: unitResult.data.unit_number,
      unit_type_code: unitResult.data.unit_type_code,
      unit_type_name: unitResult.data.unit_type_name,
    }),
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
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };

  const currentMonth = getCurrentBillingMonth();
  const rows = (data ?? []) as OwnershipRecord[];
  const currentRows = rows.filter((row) => classifyOwnershipRow(row, currentMonth) === "current");
  const unitIds = [...new Set(currentRows.map((row) => row.unit_id))];
  const { data: unitMap, error: unitError } = await getUnitMap(supabase, unitIds);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  return {
    data: currentRows
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

export async function getOwnerUnitsForBillingMonth(
  ownerId: string,
  billingMonth: string,
): Promise<QueryResult<OwnerUnitSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("owner_id", ownerId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as OwnershipRecord[];
  const currentRows = rows.filter((row) => classifyOwnershipRow(row, billingMonth) === "current");
  const unitIds = [...new Set(currentRows.map((row) => row.unit_id))];
  const { data: unitMap, error: unitError } = await getUnitMap(supabase, unitIds);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  return {
    data: currentRows
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

export async function getScheduledUnitsForOwner(
  ownerId: string,
): Promise<QueryResult<OwnerUnitSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select(OWNERSHIP_SELECT)
    .eq("owner_id", ownerId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };

  const currentMonth = getCurrentBillingMonth();
  const rows = (data ?? []) as OwnershipRecord[];
  const scheduledRows = rows.filter((row) => classifyOwnershipRow(row, currentMonth) === "scheduled");
  const unitIds = [...new Set(scheduledRows.map((row) => row.unit_id))];
  const { data: unitMap, error: unitError } = await getUnitMap(supabase, unitIds);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  return {
    data: scheduledRows
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
          ownership_status: "scheduled" as const,
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
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };

  const currentMonth = getCurrentBillingMonth();
  const rows = (data ?? []) as OwnershipRecord[];
  const pastRows = rows.filter((row) => classifyOwnershipRow(row, currentMonth) === "past");
  const unitIds = [...new Set(pastRows.map((row) => row.unit_id))];
  const { data: unitMap, error: unitError } = await getUnitMap(supabase, unitIds);
  if (unitError) return { data: [], error: unitError };
  if (!unitMap) return { data: [], error: null };

  return {
    data: pastRows
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
  const [currentUnits, scheduledUnits, pastUnits] = await Promise.all([
    getCurrentUnitsForOwner(ownerId),
    getScheduledUnitsForOwner(ownerId),
    getPastUnitsForOwner(ownerId),
  ]);

  if (currentUnits.error) return { data: null as never, error: currentUnits.error };
  if (scheduledUnits.error) return { data: null as never, error: scheduledUnits.error };
  if (pastUnits.error) return { data: null as never, error: pastUnits.error };

  return {
    data: {
      currentUnits: currentUnits.data,
      scheduledUnits: scheduledUnits.data,
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

  const currentMonth = getCurrentBillingMonth();
  let minimumEffectiveMonth = currentMonth;
  const currentOwnershipMonth = snapshot.data?.currentOwnership
    ? snapshot.data.currentOwnership.start_date.slice(0, 7)
    : null;

  if (currentOwnershipMonth) {
    const [year, month] = currentOwnershipMonth.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    if (nextMonth > minimumEffectiveMonth) {
      minimumEffectiveMonth = nextMonth;
    }
  }

  return {
    data: {
      unit: unitLookup.data,
      unitAccount: snapshot.data?.unitAccount ?? null,
      currentOwnership: snapshot.data?.currentOwnership ?? null,
      owners: ownersResult.data ?? [],
      suggestedEffectiveMonth: minimumEffectiveMonth,
      minimumEffectiveMonth,
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

    invalidateUnitDirectoryCache();
    invalidateBuildingMonthFinancialFactsCache();
    return { data: data as OwnershipRecord, error: null };
  } catch (error) {
    console.error("Ownership transfer RPC exception", {
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
