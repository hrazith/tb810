import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getActiveDevTestSessionId, getActiveDevTestSessionSummary, recordDevTestMutation } from "@/server/dev-test-session";
import { getCurrentBuilding } from "@/server/units";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";
import { loadBuildingMonthFinancialFacts } from "@/server/obligations/owner-facts";
import { calculateWaterAllocationCents, parseMilliUnits, parseMoneyCents, roundToNearestInteger } from "./index";
import { hasCompleteWaterReadings } from "./readiness";

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
  id?: string;
  description?: string | null;
  billing_period?: { period_year: number; period_month: number } | null;
  amount: number | string;
  bill_date: string;
  current_reading: number | string | null;
  previous_reading: number | string | null;
  total_consumption: number | string | null;
  created_at: string;
};

type WaterReadingFact = {
  unit_id: string;
  reading_month: string;
  consumption: number | string | null;
};

export type ValidWaterSource = {
  bill: CommonWaterBillHistoryRow;
  unitConsumptionMilli: bigint;
  commonConsumptionMilli: bigint;
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

function calculateCommonConsumption(bill: CommonWaterBillHistoryRow, readings: WaterReadingFact[], eligibleUnitIds: Set<string>) {
  const amountCents = parseMoneyCents(bill.amount);
  const supplierConsumptionMilli = parseMilliUnits(bill.total_consumption);
  if (amountCents === null || supplierConsumptionMilli === null || supplierConsumptionMilli <= 0) return null;

  const readingsByUnit = new Map<string, WaterReadingFact>();
  if (readings.length !== eligibleUnitIds.size) return null;
  for (const reading of readings) {
    if (!eligibleUnitIds.has(reading.unit_id) || readingsByUnit.has(reading.unit_id)) continue;
    readingsByUnit.set(reading.unit_id, reading);
  }
  if (readingsByUnit.size !== eligibleUnitIds.size) return null;

  const unitConsumptionsMilli: bigint[] = [];
  for (const unitId of eligibleUnitIds) {
    const reading = readingsByUnit.get(unitId);
    const consumptionMilli = parseMilliUnits(reading?.consumption);
    if (consumptionMilli === null || consumptionMilli < 0) return null;
    unitConsumptionsMilli.push(consumptionMilli);
  }

  const allocation = calculateWaterAllocationCents({ amountCents, totalConsumptionMilli: supplierConsumptionMilli, unitConsumptionsMilli });
  if (!allocation || supplierConsumptionMilli < allocation.unitConsumptionMilli) return null;
  return {
    unitConsumptionMilli: allocation.unitConsumptionMilli,
    commonConsumptionMilli: supplierConsumptionMilli - allocation.unitConsumptionMilli,
  };
}

function billingPeriodMonth(bill: CommonWaterBillHistoryRow) {
  if (!bill.billing_period) return null;
  return `${bill.billing_period.period_year}-${String(bill.billing_period.period_month).padStart(2, "0")}`;
}

export function findLatestValidWaterSource(input: {
  billDate: string;
  history: CommonWaterBillHistoryRow[];
  readings: WaterReadingFact[];
  eligibleUnitIds: Set<string>;
}) {
  const readingsByMonth = new Map<string, WaterReadingFact[]>();
  for (const reading of input.readings) {
    const month = reading.reading_month.slice(0, 7);
    const monthReadings = readingsByMonth.get(month) ?? [];
    monthReadings.push(reading);
    readingsByMonth.set(month, monthReadings);
  }

  const billsByMonth = new Map<string, CommonWaterBillHistoryRow[]>();
  for (const bill of input.history) {
    const month = billingPeriodMonth(bill);
    if (!month || month >= getMonthKey(input.billDate)) continue;
    const monthBills = billsByMonth.get(month) ?? [];
    monthBills.push(bill);
    billsByMonth.set(month, monthBills);
  }

  for (const month of [...billsByMonth.keys()].sort().reverse()) {
    const monthBills = billsByMonth.get(month) ?? [];
    if (monthBills.length !== 1) continue;
    const bill = monthBills[0];
    const result = calculateCommonConsumption(bill, readingsByMonth.get(month) ?? [], input.eligibleUnitIds);
    if (result) return { bill, ...result } satisfies ValidWaterSource;
  }
  return null;
}

export function buildCommonWaterBillDraft(input: {
  billDate: string;
  currentUnitConsumptionMilli: bigint;
  priorSource: ValidWaterSource | null;
}): QueryResult<CommonWaterBillDraft> {
  const latestPrior = input.priorSource?.bill ?? null;
  const priorAmountCents = parseMoneyCents(latestPrior?.amount);
  const priorConsumptionMilli = parseMilliUnits(latestPrior?.total_consumption);
  const previousReading = parseNumber(latestPrior?.current_reading);
  const currentConsumptionMilli = input.priorSource
    ? input.currentUnitConsumptionMilli + input.priorSource.commonConsumptionMilli
    : null;

  if (!input.priorSource || priorAmountCents === null || priorAmountCents <= 0 || priorConsumptionMilli === null || priorConsumptionMilli <= 0) {
    return { data: null, error: "Unable to find a prior valid Sedapal/Common Water period." };
  }
  if (previousReading === null || currentConsumptionMilli === null || currentConsumptionMilli <= BigInt(0)) {
    return { data: null, error: "Unable to derive a valid Sedapal reading baseline." };
  }

  const amountCents = roundToNearestInteger(priorAmountCents * currentConsumptionMilli, priorConsumptionMilli);
  const currentReading = roundToThree(previousReading + Number(currentConsumptionMilli) / 1000);

  return {
    data: {
      amount: (Number(amountCents) / 100).toFixed(2),
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
  const factsResult = await loadBuildingMonthFinancialFacts({
    buildingId: building.data.id,
    obligationMonth: billMonth,
  });
  if (factsResult.error) return { data: null as never, error: factsResult.error };
  if (!factsResult.data) return { data: null as never, error: "Building month facts unavailable." };

  const waterFacts = factsResult.data.upcoming;
  if (!waterFacts.commonWaterType) return { data: null as never, error: "Common Water utility type is missing." };
  const eligibleUnitIds = waterFacts.unitRows
    .filter((unit) => unit.unit_type_code === "condo")
    .map((unit) => unit.id);
  const supabase = await createClient();
  const [{ data: billingPeriod, error: billingPeriodError }, { data: history, error: historyError }, { data: priorReadings, error: readingsError }, { data: mutations, error: mutationsError }] = await Promise.all([
    supabase
      .from("tb810_billing_periods")
      .select("id, status, period_year, period_month")
      .eq("building_id", building.data.id)
      .eq("period_year", Number(billMonth.slice(0, 4)))
      .eq("period_month", Number(billMonth.slice(5, 7)))
      .maybeSingle(),
    supabase
      .from("tb810_utility_bills")
      .select("id, amount, bill_date, current_reading, previous_reading, total_consumption, description, created_at, billing_period:tb810_billing_periods!tb810_utility_bills_billing_period_id_fkey(period_year, period_month)")
      .eq("building_id", building.data.id)
      .eq("utility_type_id", waterFacts.commonWaterType?.id ?? "")
      .order("bill_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("tb810_meter_readings")
      .select("unit_id, reading_month, consumption")
      .eq("building_id", building.data.id)
      .eq("utility_type_id", waterFacts.commonWaterType?.id ?? "")
      .lt("reading_month", `${billMonth}-01`),
    supabase
      .from("tb810_dev_test_mutations")
      .select("record_identity")
      .eq("session_id", sessionId)
      .eq("domain", "water")
      .eq("record_type", "utility_bill")
      .eq("operation", "create"),
  ]);

  if (billingPeriodError) return { data: null as never, error: billingPeriodError.message };
  if (historyError) return { data: null as never, error: historyError.message };
  if (readingsError) return { data: null as never, error: readingsError.message };
  if (mutationsError) return { data: null as never, error: mutationsError.message };
  if (!billingPeriod) return { data: null as never, error: "Sedapal water bill has not been entered yet." };

  const currentReadings = waterFacts.waterReadings;
  if (!hasCompleteWaterReadings({ eligibleUnitIds, readings: currentReadings })) {
    return { data: null as never, error: "Complete Water readings before adding the Sedapal test bill." };
  }

  const journaledBillIds = new Set((mutations ?? []).map((mutation) => mutation.record_identity));
  const existingFixture = (history ?? []).find((bill) => bill.bill_date === billDate && bill.description === "Sedapal test bill" && journaledBillIds.has(bill.id));
  if (existingFixture?.id) return { data: { insertedCount: 0, billId: existingFixture.id }, error: null };

  const priorSource = findLatestValidWaterSource({
    billDate,
    history: history ?? [],
    readings: (priorReadings ?? []) as WaterReadingFact[],
    eligibleUnitIds: new Set(eligibleUnitIds),
  });
  if (!priorSource) return { data: null as never, error: "Unable to find a prior valid Sedapal/Common Water period." };
  const draftResult = buildCommonWaterBillDraft({
    billDate,
    currentUnitConsumptionMilli: currentReadings.reduce((sum, reading) => sum + (parseMilliUnits(reading.consumption) ?? BigInt(0)), BigInt(0)),
    priorSource,
  });

  if (draftResult.error) return { data: null as never, error: draftResult.error };
  if (!draftResult.data) return { data: null as never, error: "Unable to build Sedapal test bill." };

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .insert({
      building_id: building.data.id,
      utility_type_id: waterFacts.commonWaterType.id,
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
