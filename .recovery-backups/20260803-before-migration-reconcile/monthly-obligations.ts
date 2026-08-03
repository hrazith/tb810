"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding } from "@/server/units";

export type MonthlyObligationComponentRecord = {
  id: string;
  building_id: string;
  unit_id: string;
  unit_account_id: string;
  obligation_id: string;
  component_type: "fixed_assessment" | "metered_water" | "common_water" | "other";
  component_status: "available" | "missing";
  amount: string | null;
  currency: string;
  source_type: string | null;
  source_id: string | null;
  source_month: string | null;
  source_period_id: string | null;
  source_snapshot: unknown;
  missing_reason: string | null;
  calculated_at: string | null;
  snapshot_effective_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MonthlyObligationRecord = {
  id: string;
  building_id: string;
  billing_period_id: string;
  unit_id: string;
  unit_account_id: string;
  obligation_month: string;
  currency: string;
  status: "incomplete" | "complete";
  known_total_amount: string;
  snapshot_effective_at: string;
  generated_at: string | null;
  source_type: string;
  source_id: string | null;
  snapshot_hash: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  components: MonthlyObligationComponentRecord[];
};

type QueryResult<T> = {
  data: T;
  error: string | null;
};

const OBLIGATION_SELECT =
  "id, building_id, billing_period_id, unit_id, unit_account_id, obligation_month, currency, status, known_total_amount, snapshot_effective_at, generated_at, source_type, source_id, snapshot_hash, notes, created_at, updated_at" as const;

const COMPONENT_SELECT =
  "id, building_id, unit_id, unit_account_id, obligation_id, component_type, component_status, amount, currency, source_type, source_id, source_month, source_period_id, source_snapshot, missing_reason, calculated_at, snapshot_effective_at, notes, created_at, updated_at" as const;

export async function getBillingPeriodIdForMonth(year: number, month: number) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select("id, building_id, period_year, period_month")
    .eq("building_id", buildingResult.data.id)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data?.id ?? null, error: null };
}

export async function getMonthlyObligationForUnitAccount(
  unitAccountId: string,
  billingPeriodId: string,
): Promise<QueryResult<MonthlyObligationRecord | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_monthly_obligations")
    .select(OBLIGATION_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("unit_account_id", unitAccountId)
    .eq("billing_period_id", billingPeriodId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const { data: components, error: componentsError } = await supabase
    .from("tb810_monthly_obligation_components")
    .select(COMPONENT_SELECT)
    .eq("obligation_id", data.id)
    .order("created_at", { ascending: true });

  if (componentsError) return { data: null, error: componentsError.message };

  return {
    data: {
      ...data,
      status: data.status as MonthlyObligationRecord["status"],
      known_total_amount: String(data.known_total_amount),
      components: (components ?? []).map((component) => ({
        ...component,
        component_type: component.component_type as MonthlyObligationComponentRecord["component_type"],
        component_status: component.component_status as MonthlyObligationComponentRecord["component_status"],
        amount: component.amount === null ? null : String(component.amount),
      })),
    },
    error: null,
  };
}

export async function generateMonthlyObligationsForBillingPeriod(input: {
  billingPeriodId: string;
  snapshotEffectiveAt: string;
  unitAccountId?: string;
}): Promise<QueryResult<Array<{ obligation_id: string; unit_account_id: string }>>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: "Current building not found." };

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("tb810_generate_monthly_obligations" as never, {
    p_building_id: buildingResult.data.id,
    p_billing_period_id: input.billingPeriodId,
    p_snapshot_effective_at: input.snapshotEffectiveAt,
    p_unit_account_id: input.unitAccountId ?? null,
  } as never);

  const { data, error } = rpcResult as {
    data: Array<{ obligation_id: string; unit_account_id: string }> | null;
    error: { message: string } | null;
  };

  if (error) return { data: [], error: error.message };

  return {
    data: data ?? [],
    error: null,
  };
}
