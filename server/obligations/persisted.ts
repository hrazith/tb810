import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { ProviderMap } from "./core";
import type { MonthlyObligationComponent, MonthlyObligationComponentKey } from "./types";

// Handed-off and approved packages are read from their persisted obligation
// rows, the same rows the building summary aggregates. They are never
// recalculated from source facts, which keep changing after approval (e.g.
// reserved Gas purchases become processed).

export type PersistedObligationRow = {
  unit_id: string;
  obligation_type: string;
  amount: number | string;
  source_service_month: string;
  calculation_snapshot: unknown;
};

type ChargeLineItems = NonNullable<MonthlyObligationComponent["lineItems"]>;

type PersistedRowsQuery = {
  select(columns: string): {
    eq(column: string, value: string): {
      in(column: string, values: string[]): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

const COMPONENT_BY_OBLIGATION_TYPE: Record<string, MonthlyObligationComponentKey> = {
  fixed_assessment: "fixed_assessment",
  water_consumption: "metered_water",
  common_water: "common_water",
  gas_consumption: "gas",
  other_charge: "other_charge",
};

const PROVENANCE = "persisted_obligation";

function snapshotRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** One bounded read: the package's persisted rows for the given units only. */
export async function loadPersistedObligationRows({
  billingPeriodId,
  unitIds,
  client,
}: {
  billingPeriodId: string;
  unitIds: string[];
  client?: SupabaseClient<Database>;
}): Promise<{ data: PersistedObligationRow[]; error: string | null }> {
  if (unitIds.length === 0) return { data: [], error: null };
  const supabase = client ?? await createClient();
  // The obligations table is not in the generated types; same access shape as server/gas.
  const { data, error } = await (supabase as unknown as { from(table: string): PersistedRowsQuery })
    .from("tb810_monthly_financial_obligations")
    .select("unit_id, obligation_type, amount, source_service_month, calculation_snapshot")
    .eq("billing_period_id", billingPeriodId)
    .in("unit_id", unitIds);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as PersistedObligationRow[], error: null };
}

export function createPersistedObligationProviders(
  rows: PersistedObligationRow[],
  chargesByUnitId: Map<string, { lineItems: ChargeLineItems }> = new Map(),
): ProviderMap {
  const rowByUnitAndComponent = new Map<string, PersistedObligationRow>();
  for (const row of rows) {
    const key = COMPONENT_BY_OBLIGATION_TYPE[row.obligation_type];
    if (key) rowByUnitAndComponent.set(`${row.unit_id}:${key}`, row);
  }

  const provide = (key: MonthlyObligationComponentKey): ProviderMap[MonthlyObligationComponentKey] =>
    async ({ context, unit }) => {
      const row = rowByUnitAndComponent.get(`${unit.unitId}:${key}`);
      if (!row) return { status: "not_applicable", provenance: PROVENANCE, sourceMonth: context.obligationMonth };

      const snapshot = snapshotRecord(row.calculation_snapshot);
      const sourceMonth = typeof snapshot.sourceMonth === "string" ? snapshot.sourceMonth : row.source_service_month.slice(0, 7);
      // Charge descriptions are presentation metadata; the amount stays the persisted one.
      const sourceIds = Array.isArray(snapshot.sourceIds) ? snapshot.sourceIds : [];
      const lineItems = key === "other_charge"
        ? chargesByUnitId.get(unit.unitId)?.lineItems.filter((item) => sourceIds.includes(item.chargeId))
        : undefined;

      return {
        status: "available",
        amount: Number(row.amount).toFixed(2),
        currency: "PEN",
        provenance: PROVENANCE,
        sourceMonth,
        ...(lineItems && lineItems.length > 0 ? { lineItems } : {}),
      };
    };

  return {
    fixed_assessment: provide("fixed_assessment"),
    metered_water: provide("metered_water"),
    common_water: provide("common_water"),
    gas: provide("gas"),
    other_charge: provide("other_charge"),
  };
}
