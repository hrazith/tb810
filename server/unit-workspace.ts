import { TB810_BUILDING_ID, TB810_BUILDING_NAME } from "@/server/building";
import { createClient } from "@/lib/supabase/server";
import { calculateUpcomingUnitChargesFromFacts } from "@/server/charges";
import type { ChargeRecord } from "@/server/charges/types";
import { getUnitFixedMonthlyAssessmentFromFacts } from "@/server/budget-plans";
import { calculateGasCharges } from "@/server/gas/calculation";
import { composeMonthlyObligation } from "@/server/obligations/core";
import { createMonthlyObligationProviders } from "@/server/obligations/providers";
import type { MonthlyObligationResult } from "@/server/obligations/types";
import type { UnitDetail, UnitTypeCode } from "@/server/units/types";
import type { GasChargePreviewState } from "@/server/gas/provider";
import { calculateWaterChargePreviewsForUnit, type WaterChargePreviewBundle } from "@/server/water";
import { previousMonthKeyFromMonthKey } from "@/server/water/month-utils";

type WorkspaceMetrics = { readCount: number; startedAt: number; elapsedMs?: number };
type WorkspaceRemoteCounts = { dataRemoteRequests: number; authRemoteRequests: number };
type WorkspaceMetricsWithRemoteCounts = WorkspaceMetrics & WorkspaceRemoteCounts;

type WorkspacePerfBreakdown = {
  identityMs: number;
  ownershipMs: number;
  accountMs: number;
  assessmentMs: number;
  waterMs: number;
  gasMs: number;
  chargesMs: number;
  compositionMs: number;
};

type WorkspaceChargePreview = { amount: string; lineItems: Array<{ chargeId: string; description: string; amount: string; effectiveFromMonth: string; effectiveToMonth: string | null }> };

type UnitWorkspaceFinancialFacts = {
  plan: { currency: string; monthly_operating_budget: string } | null;
  commonWaterType: { id: string; code: string; name: string } | null;
  commonWaterBill: WaterWorkspaceContext["bill"];
  charges: ChargeRecord[];
  bills: Array<{
    id: string;
    billing_period_id: string | null;
    utility_type_id: string;
    bill_date: string;
    amount: number | string;
    total_consumption: number | string | null;
    current_reading: number | string | null;
    previous_reading: number | string | null;
  }>;
  readings: Array<{
    unit_id: string;
    reading_end: number | null;
    consumption: number | null;
    reading_date: string;
    created_at: string;
  }>;
  gasBills: Array<{ id: string; amount: number | string; processed_at: string | null }>;
  gasReadings: Array<{
    unit_id: string;
    reading_month: string;
    current_reading: number | null;
    previous_reading: number | null;
    consumption: number | null;
  }>;
  unitRows: Array<{
    id: string;
    unit_type_id: string;
    unit_type_code: UnitTypeCode;
    unit_number: string;
    has_gas_service: boolean;
    has_meter: boolean | null;
  }>;
  planYear: number;
  error?: string | null;
};

type UnitWorkspaceMonthFactsPayload = {
  plan?: { currency: string; monthly_operating_budget: number | string } | null;
  commonWaterType?: { id: string; code: string; name: string } | null;
  charges?: ChargeRecord[];
  bills?: UnitWorkspaceFinancialFacts["bills"];
  readings?: UnitWorkspaceFinancialFacts["readings"];
  gasBills?: UnitWorkspaceFinancialFacts["gasBills"];
  gasReadings?: UnitWorkspaceFinancialFacts["gasReadings"];
  unitRows?: UnitWorkspaceFinancialFacts["unitRows"];
  commonWaterBill?: UnitWorkspaceFinancialFacts["commonWaterBill"];
};

type UnitWorkspaceMonthFactsRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type WaterWorkspaceContext = Parameters<typeof calculateWaterChargePreviewsForUnit>[0];

type UnitFactPerf = {
  unitQueryMs: number;
  unitTypeQueryMs: number;
  ownershipRowsMs: number;
  accountMs: number;
  ownersMs: number;
};

function monthLabelFromKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function monthKeyFromDate(value: string) {
  return value.slice(0, 7);
}

export function normalizeUnitWorkspaceMonthFactsResponse(
  rpcResult: UnitWorkspaceMonthFactsRpcResult,
  planYear: number,
): UnitWorkspaceFinancialFacts {
  if (rpcResult.error || !rpcResult.data) {
    return {
      plan: null,
      commonWaterType: null,
      commonWaterBill: null,
      charges: [],
      bills: [],
      readings: [],
      gasBills: [],
      gasReadings: [],
      unitRows: [],
      planYear,
      error: rpcResult.error?.message ?? "tb810_get_unit_workspace_month_facts returned no payload.",
    };
  }

  const payload = rpcResult.data as UnitWorkspaceMonthFactsPayload;
  return {
    plan: payload.plan ? { currency: payload.plan.currency, monthly_operating_budget: String(payload.plan.monthly_operating_budget) } : null,
    commonWaterType: payload.commonWaterType ?? null,
    commonWaterBill: payload.commonWaterBill ?? null,
    charges: payload.charges ?? [],
    bills: payload.bills ?? [],
    readings: payload.readings ?? [],
    gasBills: payload.gasBills ?? [],
    gasReadings: payload.gasReadings ?? [],
    unitRows: payload.unitRows ?? [],
    planYear,
  };
}

type OwnershipSnapshot = {
  currentOwnership: {
    id: string;
    owner_id: string;
    owner: { id: string; full_name: string; owner_reference: string };
    start_date: string;
    end_date: string | null;
  } | null;
  scheduledOwnerships: Array<{
    id: string;
    owner_id: string;
    owner: { id: string; full_name: string; owner_reference: string };
    start_date: string;
    end_date: string | null;
  }>;
  ownershipHistory: Array<{
    id: string;
    owner_id: string;
    owner: { id: string; full_name: string; owner_reference: string };
    start_date: string;
    end_date: string | null;
    ownership_status: "current" | "scheduled" | "past";
  }>;
  unitAccount: { account_number: string; current_balance: number } | null;
};

type UnitWorkspaceReadModel = {
  unit: UnitDetail;
  ownershipSnapshot: OwnershipSnapshot;
  monthlyObligation: MonthlyObligationResult | null;
  metrics: WorkspaceMetrics;
};

type UnitWorkspaceResult =
  | { data: UnitWorkspaceReadModel; error: null; metrics: WorkspaceMetricsWithRemoteCounts & { elapsedMs: number } }
  | { data: null; error: string | null; metrics: WorkspaceMetrics };

function increment(metrics: WorkspaceMetrics) {
  metrics.readCount += 1;
}

function incrementDataRequest(counts: WorkspaceRemoteCounts) {
  counts.dataRemoteRequests += 1;
}

function logUnitWorkspacePerf(input: {
  unitNumber: string;
  obligationMonth: string;
  readCount: number;
  elapsedMs: number;
  dataRemoteRequests: number;
  authRemoteRequests: number;
  breakdown: WorkspacePerfBreakdown;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(
    [
      "[UNIT_WORKSPACE_PERF]",
      `unit=${input.unitNumber}`,
      `month=${input.obligationMonth}`,
      `reads=${input.readCount}`,
      `data_remote_requests=${input.dataRemoteRequests}`,
      `auth_remote_requests=${input.authRemoteRequests}`,
      `elapsed_ms=${input.elapsedMs}`,
      `identity_ms=${input.breakdown.identityMs}`,
      `ownership_ms=${input.breakdown.ownershipMs}`,
      `account_ms=${input.breakdown.accountMs}`,
      `assessment_ms=${input.breakdown.assessmentMs}`,
      `water_ms=${input.breakdown.waterMs}`,
      `gas_ms=${input.breakdown.gasMs}`,
      `charges_ms=${input.breakdown.chargesMs}`,
      `composition_ms=${input.breakdown.compositionMs}`,
    ].join(" "),
  );
}

function logUnitFactPerf(input: { unitNumber: string; breakdown: UnitFactPerf }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(
    [
      "[UNIT_FACT_PERF]",
      `unit=${input.unitNumber}`,
      `unit_query_ms=${input.breakdown.unitQueryMs}`,
      `unit_type_query_ms=${input.breakdown.unitTypeQueryMs}`,
      `ownership_rows_ms=${input.breakdown.ownershipRowsMs}`,
      `account_ms=${input.breakdown.accountMs}`,
      `owners_ms=${input.breakdown.ownersMs}`,
    ].join(" "),
  );
}

async function loadUnitIdentity(unitNumber: string, metrics: WorkspaceMetrics, counts: WorkspaceRemoteCounts) {
  const supabase = await createClient();
  increment(metrics);
  incrementDataRequest(counts);
  const unitQueryStarted = Date.now();
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, building_id, unit_type_id, unit_number, floor, display_order, registered_area_m2, participation_percentage, has_meter, has_gas_service, notes, active, created_at, updated_at, tb810_unit_types!tb810_units_unit_type_id_fkey(id, code, name, sort_order)")
    .eq("building_id", TB810_BUILDING_ID)
    .eq("unit_number", unitNumber)
    .maybeSingle();
  const unitQueryMs = Date.now() - unitQueryStarted;
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Unit not found." };
  const unitType = (data as unknown as { tb810_unit_types?: { id: string; code: UnitTypeCode; name: string; sort_order: number } | null }).tb810_unit_types ?? null;
  if (!unitType) return { data: null, error: null };
  logUnitFactPerf({
    unitNumber,
    breakdown: {
      unitQueryMs,
      unitTypeQueryMs: 0,
      ownershipRowsMs: 0,
      accountMs: 0,
      ownersMs: 0,
    },
  });
  return {
    data: {
      ...data,
      unit_type_name: unitType.name,
      unit_type_code: unitType.code,
      building_name: TB810_BUILDING_NAME,
    } satisfies UnitDetail,
    error: null,
  };
}

async function loadOwnershipSnapshot(unitId: string, metrics: WorkspaceMetrics, counts: WorkspaceRemoteCounts): Promise<{ data: OwnershipSnapshot; error: null } | { data: null; error: string }> {
  const supabase = await createClient();
  increment(metrics);
  incrementDataRequest(counts);
  const ownershipRowsStarted = Date.now();
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, tb810_unit_accounts!tb810_unit_accounts_unit_id_fkey(account_number, current_balance), tb810_ownerships!tb810_ownerships_unit_id_fkey(id, owner_id, unit_id, start_date, end_date, tb810_owners!tb810_ownerships_owner_id_fkey(id, full_name, owner_reference))")
    .eq("id", unitId)
    .maybeSingle();
  const ownershipRowsMs = Date.now() - ownershipRowsStarted;
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Unit not found." };
  logUnitFactPerf({
    unitNumber: unitId,
    breakdown: {
      unitQueryMs: 0,
      unitTypeQueryMs: 0,
      ownershipRowsMs,
      accountMs: 0,
      ownersMs: 0,
    },
  });
  const currentMonth = "2026-08";
  const ownerships = ((data as unknown as { tb810_ownerships?: Array<{ id: string; owner_id: string; unit_id: string; start_date: string; end_date: string | null; tb810_owners?: { id: string; full_name: string; owner_reference: string } | null }> }).tb810_ownerships ?? []);
  const account = (data as unknown as { tb810_unit_accounts?: { account_number: string; current_balance: number } | null }).tb810_unit_accounts ?? null;
  const rows = ownerships.flatMap((row) => {
    const owner = row.tb810_owners ?? null;
    if (!owner) return [];
    const ownership_status: OwnershipSnapshot["ownershipHistory"][number]["ownership_status"] =
      row.start_date.slice(0, 7) > currentMonth ? "scheduled" : row.end_date ? "past" : "current";
    return [{ ...row, owner, ownership_status }];
  });
  return {
    data: {
      currentOwnership: rows.find((row) => row.ownership_status === "current") ?? null,
      scheduledOwnerships: rows.filter((row) => row.ownership_status === "scheduled"),
      ownershipHistory: rows,
      unitAccount: account ? { account_number: account.account_number, current_balance: account.current_balance } : null,
    },
    error: null,
  };
}

async function loadUnitFinancialFacts(unit: UnitDetail, metrics: WorkspaceMetrics, counts: WorkspaceRemoteCounts, obligationMonth: string): Promise<UnitWorkspaceFinancialFacts> {
  const planYear = Number(obligationMonth.slice(0, 4));
  const supabase = await createClient();
  increment(metrics);
  incrementDataRequest(counts);
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("tb810_get_unit_workspace_month_facts", {
    p_building_id: TB810_BUILDING_ID,
    p_unit_id: unit.id,
    p_plan_year: planYear,
    p_reading_month: "2026-07-01",
  });
  return normalizeUnitWorkspaceMonthFactsResponse({ data, error }, planYear);
}

function buildWaterPreviewFromFacts(
  unit: UnitDetail,
  obligationMonth: string,
  financialFacts: UnitWorkspaceFinancialFacts,
) {
  const sourceReadingMonth = previousMonthKeyFromMonthKey(obligationMonth) ?? "2026-07";
  const sourceReadingMonthLabel = monthLabelFromKey(sourceReadingMonth);
  const billingMonthLabel = monthLabelFromKey(obligationMonth);
  const commonWaterBill = financialFacts.commonWaterBill ?? null;
  const commonWaterType = financialFacts.commonWaterType ?? null;
  const condoUnitRows = financialFacts.unitRows.filter((row) => row.unit_type_code === "condo");
  const eligibleUnitIds = condoUnitRows.map((row) => row.id);
  const readingsByUnit = new Map<string, Array<{ reading_end: number | null; consumption: number | null; created_at: string }>>();
  for (const row of financialFacts.readings) {
    if (monthKeyFromDate(row.reading_date) !== sourceReadingMonth) continue;
    const rows = readingsByUnit.get(row.unit_id) ?? [];
    rows.push(row);
    readingsByUnit.set(row.unit_id, rows);
  }
  const completeness = {
    monthKey: sourceReadingMonth,
    monthLabel: sourceReadingMonthLabel,
    completedCount: eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length,
    totalExpectedCount: eligibleUnitIds.length,
    percentage: eligibleUnitIds.length > 0 ? (eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length / eligibleUnitIds.length) * 100 : 0,
    incompleteCount: Math.max(eligibleUnitIds.length - eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length, 0),
  };

  const context: WaterWorkspaceContext = {
    buildingId: TB810_BUILDING_ID,
    supabase: {} as never,
    unit: {
      id: unit.id,
      unit_type_id: unit.unit_type_id,
      has_meter: Boolean(unit.has_meter),
    },
    unitTypeCode: unit.unit_type_code,
    commonWaterTypeId: commonWaterType?.id ?? "",
    completeness,
    sourceReadingMonth,
    sourceReadingMonthLabel,
    billingMonthLabel,
    eligibleUnitIds,
    readingsByUnit,
    bill: commonWaterBill,
  };

  return calculateWaterChargePreviewsForUnit(context);
}

export function buildWaterWorkspaceContextFromFacts(
  unit: UnitDetail,
  obligationMonth: string,
  financialFacts: UnitWorkspaceFinancialFacts,
) {
  const sourceReadingMonth = previousMonthKeyFromMonthKey(obligationMonth) ?? "2026-07";
  const sourceReadingMonthLabel = monthLabelFromKey(sourceReadingMonth);
  const billingMonthLabel = monthLabelFromKey(obligationMonth);
  const commonWaterType = financialFacts.commonWaterType ?? null;
  const condoUnitRows = financialFacts.unitRows.filter((row) => row.unit_type_code === "condo");
  const eligibleUnitIds = condoUnitRows.map((row) => row.id);
  const readingsByUnit = new Map<string, Array<{ reading_end: number | null; consumption: number | null; created_at: string }>>();
  for (const row of financialFacts.readings) {
    if (monthKeyFromDate(row.reading_date) !== sourceReadingMonth) continue;
    const rows = readingsByUnit.get(row.unit_id) ?? [];
    rows.push(row);
    readingsByUnit.set(row.unit_id, rows);
  }
  const completeness = {
    monthKey: sourceReadingMonth,
    monthLabel: sourceReadingMonthLabel,
    completedCount: eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length,
    totalExpectedCount: eligibleUnitIds.length,
    percentage: eligibleUnitIds.length > 0 ? (eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length / eligibleUnitIds.length) * 100 : 0,
    incompleteCount: Math.max(eligibleUnitIds.length - eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length, 0),
  };

  return {
    buildingId: TB810_BUILDING_ID,
    supabase: {} as never,
    unit: {
      id: unit.id,
      unit_type_id: unit.unit_type_id,
      has_meter: Boolean(unit.has_meter),
    },
    unitTypeCode: unit.unit_type_code,
    commonWaterTypeId: commonWaterType?.id ?? "",
    completeness,
    sourceReadingMonth,
    sourceReadingMonthLabel,
    billingMonthLabel,
    eligibleUnitIds,
    readingsByUnit,
    bill: financialFacts.commonWaterBill ?? null,
  } satisfies WaterWorkspaceContext;
}

function buildUnitChargesFromFacts(
  unitId: string,
  obligationMonth: string,
  financialFacts: UnitWorkspaceFinancialFacts,
) {
  return calculateUpcomingUnitChargesFromFacts(financialFacts.charges, unitId, obligationMonth);
}

export function buildGasCalculationInputFromFacts(
  financialFacts: UnitWorkspaceFinancialFacts,
  obligationMonth: string,
) {
  const gasReadingsByUnit = new Map(
    (financialFacts.gasReadings ?? []).map((row) => [row.unit_id, row]),
  );
  return {
    sourceReadingMonth: "2026-07",
    obligationMonth,
    supplierBills: (financialFacts.gasBills ?? []).map((bill) => ({
      billId: bill.id,
      amount: String(bill.amount),
      status: bill.processed_at ? ("processed" as const) : ("unprocessed" as const),
    })),
    units: (financialFacts.unitRows ?? []).map((row) => ({
      unitId: row.id,
      unitNumber: row.unit_number,
      unitTypeCode: row.unit_type_code,
      hasGasService: Boolean(row.has_gas_service),
      consumption: gasReadingsByUnit.get(row.id)?.consumption == null
        ? null
        : String(gasReadingsByUnit.get(row.id)?.consumption),
    })),
  };
}

function loadUnitWorkspaceWater(
  unit: UnitDetail,
  obligationMonth: string,
  financialFacts: UnitWorkspaceFinancialFacts,
) {
  const startedAt = Date.now();
  const water = buildWaterPreviewFromFacts(unit, obligationMonth, financialFacts);
  return { water, elapsedMs: Date.now() - startedAt };
}

function loadUnitWorkspaceCharges(
  unitId: string,
  obligationMonth: string,
  financialFacts: UnitWorkspaceFinancialFacts,
) {
  const startedAt = Date.now();
  const charges = buildUnitChargesFromFacts(unitId, obligationMonth, financialFacts);
  return { charges, elapsedMs: Date.now() - startedAt };
}

export async function loadUnitWorkspace(unitNumber: string, obligationMonth: string): Promise<UnitWorkspaceResult> {
  const metrics: WorkspaceMetrics = { readCount: 0, startedAt: Date.now() };
  const remoteCounts: WorkspaceRemoteCounts = { dataRemoteRequests: 0, authRemoteRequests: 0 };
  const breakdown: WorkspacePerfBreakdown = {
    identityMs: 0,
    ownershipMs: 0,
    accountMs: 0,
    assessmentMs: 0,
    waterMs: 0,
    gasMs: 0,
    chargesMs: 0,
    compositionMs: 0,
  };
  const identityStarted = Date.now();
  const unitResult = await loadUnitIdentity(unitNumber, metrics, remoteCounts);
  breakdown.identityMs = Date.now() - identityStarted;
  if (unitResult.error) return { data: null, error: unitResult.error, metrics };
  if (!unitResult.data) return { data: null, error: null, metrics };
  const unit = unitResult.data;
  const ownershipStarted = Date.now();
  const [ownershipResult, financialFacts] = await Promise.all([
    loadOwnershipSnapshot(unit.id, metrics, remoteCounts),
    loadUnitFinancialFacts(unit, metrics, remoteCounts, obligationMonth),
  ]);
  breakdown.ownershipMs = Date.now() - ownershipStarted;
  breakdown.accountMs = 0;
  if (ownershipResult.error) return { data: null, error: ownershipResult.error, metrics };
  if (financialFacts.error) return { data: null, error: financialFacts.error, metrics };
  const assessmentStarted = Date.now();
  const fixedAssessment = getUnitFixedMonthlyAssessmentFromFacts({
    unitId: unit.id,
    planYear: financialFacts.planYear,
    unitParticipationPercentage: unit.participation_percentage,
    plan: financialFacts.plan ?? null,
  });
  breakdown.assessmentMs = Date.now() - assessmentStarted;
  const gasStarted = Date.now();
  const gasCalculation = calculateGasCharges(buildGasCalculationInputFromFacts(financialFacts, obligationMonth));
  breakdown.gasMs = Date.now() - gasStarted;

  const [waterResult, chargeResult] = await Promise.all([
    Promise.resolve(loadUnitWorkspaceWater(unit, obligationMonth, financialFacts)),
    Promise.resolve(loadUnitWorkspaceCharges(unit.id, obligationMonth, financialFacts)),
  ]);
  breakdown.waterMs = waterResult.elapsedMs;
  breakdown.chargesMs = chargeResult.elapsedMs;

  const compositionStarted = Date.now();
  const monthlyObligation = await composeMonthlyObligation(
    { obligationMonth, buildingId: TB810_BUILDING_ID, buildingName: TB810_BUILDING_NAME },
    [{ unitId: unit.id, unitNumber: unit.unit_number, unitAccountId: unit.id, unitTypeCode: unit.unit_type_code, hasMeter: Boolean(unit.has_meter), participationPercentage: unit.participation_percentage }],
    createMonthlyObligationProviders({
      fixedAssessmentByUnitId: new Map([[unit.id, fixedAssessment]]),
      waterByUnitId: new Map<string, WaterChargePreviewBundle>([[unit.id, waterResult.water]]),
      gasByUnitId: new Map<string, GasChargePreviewState>([
        [
          unit.id,
          gasCalculation.blockers.length > 0
            ? { status: "unavailable", message: gasCalculation.blockers.join(" ") || "Gas lookup data is incomplete." }
            : {
                status: "available",
                data: {
                  ...gasCalculation,
                  sourceReadingMonthLabel: "2026-07",
                  billingMonthLabel: obligationMonth,
                },
              },
        ],
      ]),
      chargesByUnitId: new Map<string, WorkspaceChargePreview>([[unit.id, chargeResult.charges]]),
    }),
  );
  breakdown.compositionMs = Date.now() - compositionStarted;
  const elapsedMs = Date.now() - metrics.startedAt;
  logUnitWorkspacePerf({
    unitNumber,
    obligationMonth,
    readCount: metrics.readCount,
    elapsedMs,
    dataRemoteRequests: remoteCounts.dataRemoteRequests,
    authRemoteRequests: remoteCounts.authRemoteRequests,
    breakdown,
  });
  return {
    data: {
      unit,
      ownershipSnapshot: ownershipResult.data ?? {
        currentOwnership: null,
        scheduledOwnerships: [],
        ownershipHistory: [],
        unitAccount: null,
      },
      monthlyObligation,
      metrics: { readCount: metrics.readCount, startedAt: metrics.startedAt, elapsedMs },
    },
    error: null,
    metrics: { ...metrics, ...remoteCounts, elapsedMs },
  };
}
