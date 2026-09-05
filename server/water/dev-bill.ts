import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getActiveDevTestSessionId, getActiveDevTestSessionSummary, recordDevTestMutation } from "@/server/dev-test-session";
import { getCurrentBuilding } from "@/server/units";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";

type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

export type CommonWaterBillDraft = {
  amount: string;
  billDate: string;
  currentReading: number;
  previousReading: number;
  description: string;
};

export type CommonWaterBillHistoryRow = {
  amount: number | string;
  bill_date: string;
  current_reading: number | string | null;
  previous_reading: number | string | null;
  total_consumption: number | string | null;
  created_at: string;
};

function parseNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToThree(value: number) {
  return Number(value.toFixed(3));
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}

export function buildCommonWaterBillDraft(input: {
  billDate: string;
  history: CommonWaterBillHistoryRow[];
  fallbackAmount?: string | null;
}): QueryResult<CommonWaterBillDraft> {
  const priorBills = [...input.history]
    .filter((bill) => bill.bill_date < input.billDate)
    .sort((left, right) => right.bill_date.localeCompare(left.bill_date) || right.created_at.localeCompare(left.created_at));

  const latestPrior = priorBills[0] ?? null;
  const amount =
    latestPrior ? parseNumber(latestPrior.amount) : parseNumber(input.fallbackAmount ?? null);
  const previousReading = latestPrior ? parseNumber(latestPrior.current_reading) : null;
  const latestConsumption = latestPrior ? parseNumber(latestPrior.total_consumption) : null;

  if (amount === null || amount <= 0) {
    return { data: null, error: "Unable to derive a realistic Sedapal bill amount." };
  }
  if (previousReading === null || latestConsumption === null || latestConsumption <= 0) {
    return { data: null, error: "Unable to derive a realistic Sedapal bill reading baseline." };
  }

  const currentReading = roundToThree(previousReading + latestConsumption);

  return {
    data: {
      amount: amount.toFixed(2),
      billDate: input.billDate,
      currentReading,
      previousReading: roundToThree(previousReading),
      description: "Sedapal test bill",
    },
    error: null,
  };
}

export async function addCommonWaterBillForCurrentBusinessMonth(): Promise<QueryResult<{ insertedCount: number; billId: string }>> {
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
  const billDate = businessNow.toISOString().slice(0, 10);
  const billMonth = getMonthKey(billDate);
  const supabase = await createClient();

  const { data: utilityType, error: utilityTypeError } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", "common_water")
    .maybeSingle();
  if (utilityTypeError) return { data: null as never, error: utilityTypeError.message };
  if (!utilityType) return { data: null as never, error: "Common Water utility type is missing." };

  const [{ data: billingPeriod, error: billingPeriodError }, { data: history, error: historyError }] = await Promise.all([
    supabase
      .from("tb810_billing_periods")
      .select("id, status, period_year, period_month")
      .eq("building_id", building.data.id)
      .eq("period_year", Number(billMonth.slice(0, 4)))
      .eq("period_month", Number(billMonth.slice(5, 7)))
      .maybeSingle(),
    supabase
      .from("tb810_utility_bills")
      .select("id, amount, bill_date, current_reading, previous_reading, total_consumption, created_at")
      .eq("building_id", building.data.id)
      .eq("utility_type_id", utilityType.id)
      .order("bill_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (billingPeriodError) return { data: null as never, error: billingPeriodError.message };
  if (historyError) return { data: null as never, error: historyError.message };
  if (!billingPeriod) return { data: null as never, error: "Sedapal water bill has not been entered yet." };

  const draftResult = buildCommonWaterBillDraft({
    billDate,
    history: (history ?? []).map((row) => ({
      amount: row.amount,
      bill_date: row.bill_date,
      current_reading: row.current_reading,
      previous_reading: row.previous_reading,
      total_consumption: row.total_consumption,
      created_at: row.created_at,
    })),
  });

  if (draftResult.error) return { data: null as never, error: draftResult.error };
  if (!draftResult.data) return { data: null as never, error: "Unable to build Sedapal test bill." };

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .insert({
      building_id: building.data.id,
      utility_type_id: utilityType.id,
      billing_period_id: billingPeriod.id,
      bill_date: draftResult.data.billDate,
      amount: Number(draftResult.data.amount),
      description: draftResult.data.description,
      notes: null,
      previous_reading: draftResult.data.previousReading,
      current_reading: draftResult.data.currentReading,
      total_consumption: roundToThree(draftResult.data.currentReading - draftResult.data.previousReading),
      unit_cost: Number((Number(draftResult.data.amount) / (draftResult.data.currentReading - draftResult.data.previousReading)).toFixed(4)),
      status: "received",
      legacy_table: null,
      legacy_id: null,
      legacy_metadata: {},
    })
    .select("id")
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  const journalResult = await recordDevTestMutation({
    domain: "water",
    recordType: "utility_bill",
    operation: "create",
    recordIdentity: data.id,
  });
  if (journalResult.error) {
    await supabase.from("tb810_utility_bills").delete().eq("id", data.id);
    return { data: null as never, error: journalResult.error };
  }

  invalidateBuildingMonthFinancialFactsCache(building.data.id);
  return { data: { insertedCount: 1, billId: data.id }, error: null };
}
