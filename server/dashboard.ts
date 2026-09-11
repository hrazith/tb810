import { cache } from "react";

import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { isChargeEligibleForMonth, nextMonthKey } from "@/server/charges/month";
import { buildMonthlyObligationSummaryFromFacts, buildMonthlyObligationSummaryFromSnapshot } from "@/server/obligations/summary-facts";
import { loadBuildingMonthFinancialFacts, type BuildingMonthFinancialFacts } from "@/server/obligations/owner-facts";
import { hasCompleteWaterReadings } from "@/server/water/readiness";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

type SourceWorkFacts = {
  water: {
    commonWaterBillPresent: boolean;
    meterReadingCount: number;
    meterReadingExpectedCount: number;
    meterReadingCompleteCount: number;
    readingsReady: boolean;
  };
  gas: {
    supplierBillCount: number;
    gasReadingCount: number;
    gasUnitCount: number;
  };
};

type UpcomingFacts = {
  sourceReadingMonth: string;
  obligations: ReturnType<typeof buildMonthlyObligationSummaryFromFacts>;
  commonWaterBill: {
    id: string;
    amount: string;
    bill_date: string | null;
    status: string;
  } | null;
  gas: {
    supplierBillCount: number;
    supplierBillTotal: string;
  };
  charges: {
    unitChargeCount: number;
    ownerDirectChargeCount: number;
  };
  worthNoting: DashboardWorthNoting[];
  obligationLifecycle: BuildingMonthFinancialFacts["obligationLifecycle"];
};

export type DashboardContext = "close" | "open";
export type DashboardFinancialFocus = "current" | "upcoming";
export type CarlosApprovalState = "ready" | "overdue" | "approved" | "not_ready";

export const MONTHLY_OBLIGATION_APPROVAL_CUTOFF_DAY = 5;

export type GulianaDashboardFacts = {
  businessDate: string;
  operatingMonth: string;
  upcomingObligationMonth: string;
  context: DashboardContext;
  sourceWork: SourceWorkFacts;
  current: UpcomingFacts;
  upcoming: UpcomingFacts;
};

export type DashboardSectionState = "waiting" | "active" | "complete" | "blocked" | "compressed";

export type DashboardQuickActionKey =
  | "upload_sedapal_bill"
  | "upload_water_meter_readings"
  | "upload_gas_supplier_bill"
  | "upload_gas_readings";

export type DashboardAttention = {
  source: "obligations" | "water" | "gas";
  happened: string;
  impact: string;
};

export type DashboardWorthNoting = {
  kind: "unit_charge";
  unitNumber: string;
  amount: string;
  obligationMonth: string;
  reason: string;
};

export type GulianaDashboardProjection = {
  businessDate: string;
  operatingMonth: string;
  context: DashboardContext;
  financialFocus: DashboardFinancialFocus;
  water: {
    state: DashboardSectionState;
    completion: "incomplete" | "complete";
    emphasis: "normal" | "compressed" | "attention";
    billPresent: boolean;
    meterReadingsComplete: boolean;
  };
  gas: {
    state: DashboardSectionState;
    completion: "incomplete" | "complete";
    emphasis: "normal" | "compressed" | "attention";
    supplierBillsPresent: boolean;
    readingsComplete: boolean;
  };
  obligations: {
    state: DashboardSectionState;
    emphasis: "normal" | "compressed" | "attention";
    ready: boolean;
    blocked: boolean;
    readiness: "ready_for_carlos" | "awaiting_approval" | "not_ready";
  };
  handoff: {
    obligationMonth: string;
    status: "approved_ready_for_dispatch";
  } | null;
  attentions: DashboardAttention[];
  worthNoting: DashboardWorthNoting[];
  completed: Array<{
    key: "water" | "gas" | "obligations";
    state: "complete" | "compressed";
  }>;
  quickActions: DashboardQuickActionKey[];
};

export type CarlosDashboardProjection = {
  businessDate: string;
  financialFocus: DashboardFinancialFocus;
  obligationMonth: string;
  total: string | null;
  components: UpcomingFacts["obligations"]["components"];
  billingPeriodId: string | null;
  billingPeriodStatus: string | null;
  approvalState: CarlosApprovalState;
};

function countCompletedWaterReadings(financialFacts: BuildingMonthFinancialFacts) {
  const sourceReadingMonth = financialFacts.sourceReadingMonth;
  const condoUnitIds = financialFacts.unitRows
    .filter((row) => row.unit_type_code === "condo")
    .map((row) => row.id);
  const readingsByUnit = new Map<string, boolean>();

  for (const reading of financialFacts.waterReadings) {
    if (reading.reading_date.slice(0, 7) !== sourceReadingMonth) continue;
    if (reading.reading_end === null) continue;
    readingsByUnit.set(reading.unit_id, true);
  }

  let completedCount = 0;
  for (const unitId of condoUnitIds) {
    if (readingsByUnit.has(unitId)) completedCount += 1;
  }

  return {
    expectedCount: condoUnitIds.length,
    completedCount,
    readingCount: financialFacts.waterReadings.filter(
      (reading) => reading.reading_date.slice(0, 7) === sourceReadingMonth && reading.reading_end !== null,
    ).length,
  };
}

function countChargeRows(financialFacts: BuildingMonthFinancialFacts, obligationMonth: string) {
  const unitCharges = financialFacts.charges.filter((row) => {
    if (row.owner_id != null || row.unit_id == null) return false;
    const effectiveFromMonth = row.effective_from_month.slice(0, 7);
    const effectiveToMonth = row.effective_to_month ? row.effective_to_month.slice(0, 7) : null;
    return row.schedule === "one_off"
      ? effectiveFromMonth === obligationMonth
      : effectiveFromMonth <= obligationMonth && (effectiveToMonth === null || effectiveToMonth >= obligationMonth);
  });

  const ownerDirectCharges = financialFacts.charges.filter((row) => {
    if (row.owner_id == null || row.unit_id != null) return false;
    const effectiveFromMonth = row.effective_from_month.slice(0, 7);
    const effectiveToMonth = row.effective_to_month ? row.effective_to_month.slice(0, 7) : null;
    return row.schedule === "one_off"
      ? effectiveFromMonth === obligationMonth
      : effectiveFromMonth <= obligationMonth && (effectiveToMonth === null || effectiveToMonth >= obligationMonth);
  });

  return {
    unitChargeCount: unitCharges.length,
    ownerDirectChargeCount: ownerDirectCharges.length,
  };
}

export function deriveUnitChargeWorthNoting(
  financialFacts: BuildingMonthFinancialFacts,
  obligationMonth: string,
): DashboardWorthNoting[] {
  const unitsById = new Map(
    financialFacts.unitRows
      .filter((unit) => unit.unit_type_code === "condo")
      .map((unit) => [unit.id, unit.unit_number]),
  );

  return financialFacts.charges
    .filter((row) => {
      if (row.owner_id != null || row.unit_id == null || row.schedule !== "one_off") return false;
      if (!unitsById.has(row.unit_id)) return false;
      return isChargeEligibleForMonth({
        schedule: row.schedule,
        effectiveFromMonth: row.effective_from_month.slice(0, 7),
        effectiveToMonth: row.effective_to_month ? row.effective_to_month.slice(0, 7) : null,
        obligationMonth,
      });
    })
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
    .map((row) => ({
      kind: "unit_charge" as const,
      unitNumber: unitsById.get(row.unit_id as string) as string,
      amount: String(row.amount),
      obligationMonth,
      reason: row.description,
    }));
}

function monthLabelFromMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
}

function isApprovedLifecycleStatus(status: string | null) {
  return status === "approved" || status === "invoices_generated" || status === "closed";
}

function hasBlockedObligationComponent(obligations: UpcomingFacts["obligations"]) {
  return obligations.components.fixed_assessment.state === "blocked"
    || obligations.components.metered_water.state === "blocked"
    || obligations.components.common_water.state === "blocked"
    || obligations.components.gas.state === "blocked";
}

function deriveFinancialFocus(monthFacts: GulianaDashboardFacts): DashboardFinancialFocus {
  const businessMonth = monthFacts.businessDate.slice(0, 7);
  const current = monthFacts.current;

  if (businessMonth < current.obligations.obligationMonth) return "upcoming";

  if (current.obligationLifecycle.mode === "snapshotted") {
    return isApprovedLifecycleStatus(current.obligationLifecycle.billingPeriodStatus) ? "upcoming" : "current";
  }

  if (current.obligations.total === null || hasBlockedObligationComponent(current.obligations)) return "current";
  return businessMonth < monthFacts.upcoming.obligations.obligationMonth ? "upcoming" : "current";
}

function isReadyToApprove(facts: UpcomingFacts) {
  return facts.obligations.total !== null && !hasBlockedObligationComponent(facts.obligations);
}

export function projectCarlosDashboard(monthFacts: GulianaDashboardFacts): CarlosDashboardProjection {
  const financialFocus = deriveFinancialFocus(monthFacts);
  const currentLifecycle = monthFacts.current.obligationLifecycle;
  const hasCurrentApprovalLifecycle = currentLifecycle.mode === "snapshotted"
    && (currentLifecycle.billingPeriodStatus === "ready_for_review" || isApprovedLifecycleStatus(currentLifecycle.billingPeriodStatus));
  const financialFacts = hasCurrentApprovalLifecycle ? monthFacts.current : monthFacts[financialFocus];
  const lifecycle = financialFacts.obligationLifecycle;
  const currentMonth = monthFacts.businessDate.slice(0, 7) === financialFacts.obligations.obligationMonth;
  const readyForApproval = currentMonth && lifecycle.mode === "snapshotted"
    && lifecycle.billingPeriodStatus === "ready_for_review"
    && isReadyToApprove(financialFacts);
  const approvalState = readyForApproval
    ? currentMonth && Number(monthFacts.businessDate.slice(8, 10)) > MONTHLY_OBLIGATION_APPROVAL_CUTOFF_DAY ? "overdue" : "ready"
    : currentMonth && lifecycle.mode === "snapshotted" && isApprovedLifecycleStatus(lifecycle.billingPeriodStatus) ? "approved" : "not_ready";

  return {
    businessDate: monthFacts.businessDate,
    financialFocus,
    obligationMonth: financialFacts.obligations.obligationMonth,
    total: financialFacts.obligations.total,
    components: financialFacts.obligations.components,
    billingPeriodId: lifecycle.billingPeriodId,
    billingPeriodStatus: lifecycle.billingPeriodStatus,
    approvalState,
  };
}

function deriveAttentions(
  sourceWork: SourceWorkFacts,
  facts: UpcomingFacts,
  upcomingFacts: UpcomingFacts,
  financialFocus: DashboardFinancialFocus,
  sourceWorkActionable: boolean,
  businessDate: string,
): DashboardAttention[] {
  const attentions: DashboardAttention[] = [];
  const sourceMonthLabel = monthLabelFromMonthKey(facts.sourceReadingMonth);
  const upcomingMonthLabel = monthLabelFromMonthKey(facts.obligations.obligationMonth);
  const sourceWorkMonthLabel = monthLabelFromMonthKey(upcomingFacts.sourceReadingMonth);
  const sourceWorkObligationMonthLabel = monthLabelFromMonthKey(upcomingFacts.obligations.obligationMonth);
  const waterMissingCount = Math.max(sourceWork.water.meterReadingExpectedCount - sourceWork.water.meterReadingCompleteCount, 0);
  const gasMissingCount = Math.max(sourceWork.gas.gasUnitCount - sourceWork.gas.gasReadingCount, 0);
  const currentSedapalMissing = !facts.commonWaterBill && facts.obligations.components.common_water.state === "blocked";
  const sourceWorkLate = Number(businessDate.slice(8, 10)) >= 7;
  const sourceSedapalLate = sourceWorkLate
    && !sourceWork.water.commonWaterBillPresent
    && (sourceWork.water.meterReadingExpectedCount > 0 || sourceWork.water.meterReadingCount > 0);
  const currentSedapalBlocker = !sourceWorkActionable
    && facts.obligations.obligationMonth === businessDate.slice(0, 7)
    && currentSedapalMissing;
  const sharedWaterReconciliationFailure = facts.obligations.components.metered_water.state === "blocked"
    && facts.obligations.components.common_water.state === "blocked"
    && facts.obligations.components.metered_water.reason === "Common Water pool would be negative."
    && facts.obligations.components.common_water.reason === facts.obligations.components.metered_water.reason;

  if (sourceSedapalLate || currentSedapalBlocker) {
    attentions.push({
      source: "water",
      happened: sourceSedapalLate
        ? `Sedapal bill for ${sourceWorkMonthLabel} is late.`
        : `Sedapal bill is missing for ${sourceMonthLabel}.`,
      impact: sourceSedapalLate
        ? `${sourceWorkObligationMonthLabel} water obligations cannot be completed.`
        : `${upcomingMonthLabel} water obligations cannot be completed.`,
    });
  }

  if (sourceWorkLate && waterMissingCount > 0) {
    attentions.push({
      source: "water",
      happened: `Water meter readings for ${sourceWorkMonthLabel} are late. ${waterMissingCount} readings are still missing.`,
      impact: `${sourceWorkObligationMonthLabel} water obligations cannot be completed.`,
    });
  }

  const suppressWaterDownstream = sourceWorkActionable
    ? !sourceWork.water.commonWaterBillPresent || waterMissingCount > 0
    : currentSedapalMissing;
  const suppressGasDownstream = sourceWorkActionable && gasMissingCount > 0;
  const financialBlockers = financialFocus === "current" ? [
    facts.obligations.components.fixed_assessment.reason,
    suppressWaterDownstream ? null : facts.obligations.components.metered_water.reason,
    suppressWaterDownstream || sharedWaterReconciliationFailure ? null : facts.obligations.components.common_water.reason,
    suppressGasDownstream ? null : facts.obligations.components.gas.reason,
  ] : [];
  for (const message of financialBlockers) {
    if (!message) continue;
    attentions.push({
      source: "obligations",
      happened: message,
      impact: `${upcomingMonthLabel} obligations cannot be completed.`,
    });
  }
  return attentions;
}

function deriveWaterState(
  sourceWork: SourceWorkFacts,
  obligations: UpcomingFacts["obligations"],
  sourceWorkActionable: boolean,
): GulianaDashboardProjection["water"] {
  const complete = sourceWork.water.commonWaterBillPresent && sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount;
  const active = sourceWork.water.commonWaterBillPresent || sourceWork.water.meterReadingCount > 0;
  const blocked = sourceWorkActionable && (obligations.components.common_water.state === "blocked" || obligations.components.metered_water.state === "blocked");

  return {
    state: blocked ? "blocked" : complete ? "complete" : active ? "active" : "waiting",
    completion: complete ? "complete" : "incomplete",
    emphasis: blocked ? "attention" : complete ? "compressed" : "normal",
    billPresent: sourceWork.water.commonWaterBillPresent,
    meterReadingsComplete: sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount,
  };
}

function deriveGasState(
  sourceWork: SourceWorkFacts,
  obligations: UpcomingFacts["obligations"],
  sourceWorkActionable: boolean,
): GulianaDashboardProjection["gas"] {
  const complete = sourceWork.gas.supplierBillCount > 0 && sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount;
  const active = sourceWork.gas.supplierBillCount > 0 || sourceWork.gas.gasReadingCount > 0;
  const blocked = sourceWorkActionable && obligations.components.gas.state === "blocked";

  return {
    state: blocked ? "blocked" : complete ? "complete" : active ? "active" : "waiting",
    completion: complete ? "complete" : "incomplete",
    emphasis: blocked ? "attention" : complete ? "compressed" : "normal",
    supplierBillsPresent: sourceWork.gas.supplierBillCount > 0,
    readingsComplete: sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount,
  };
}

function deriveObligationState(
  obligations: UpcomingFacts["obligations"],
  lifecycle: UpcomingFacts["obligationLifecycle"],
  businessDate: string,
): GulianaDashboardProjection["obligations"] {
  const blocked = obligations.components.fixed_assessment.state === "blocked"
    || obligations.components.metered_water.state === "blocked"
    || obligations.components.common_water.state === "blocked"
    || obligations.components.gas.state === "blocked";
  const ready = obligations.total !== null && !blocked;
  const lifecycleVisible = businessDate.slice(0, 7) >= obligations.obligationMonth;

  return {
    state: blocked ? "blocked" : ready ? "complete" : "active",
    emphasis: blocked ? "attention" : ready ? "compressed" : "normal",
    ready,
    blocked,
    readiness: ready ? lifecycleVisible && lifecycle?.mode === "snapshotted" ? "awaiting_approval" : "ready_for_carlos" : "not_ready",
  };
}

function deriveCompleted(
  sourceWork: SourceWorkFacts,
  obligations: UpcomingFacts["obligations"],
): GulianaDashboardProjection["completed"] {
  const completed: GulianaDashboardProjection["completed"] = [];
  if (sourceWork.water.commonWaterBillPresent && sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount) {
    completed.push({ key: "water", state: "compressed" });
  }
  if (sourceWork.gas.supplierBillCount > 0 && sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount) {
    completed.push({ key: "gas", state: "compressed" });
  }
  if (obligations.total !== null && !obligations.components.fixed_assessment.reason && !obligations.components.metered_water.reason && !obligations.components.common_water.reason && !obligations.components.gas.reason) {
    completed.push({ key: "obligations", state: "compressed" });
  }
  return completed;
}

export function projectGulianaDashboard(monthFacts: GulianaDashboardFacts): GulianaDashboardProjection {
  const sourceWork = monthFacts.sourceWork;
  const financialFocus = deriveFinancialFocus(monthFacts);
  const financialFacts = monthFacts[financialFocus];
  const sourceWorkActionable = financialFocus === "upcoming" && monthFacts.current.obligationLifecycle.mode !== "snapshotted";
  const obligations = deriveObligationState(financialFacts.obligations, financialFacts.obligationLifecycle, monthFacts.businessDate);
  const water = deriveWaterState(sourceWork, financialFacts.obligations, sourceWorkActionable);
  const gas = deriveGasState(sourceWork, financialFacts.obligations, sourceWorkActionable);
  const currentLifecycle = monthFacts.current.obligationLifecycle;
  const currentObligationMonth = monthFacts.current.obligations.obligationMonth;
  const handoff = monthFacts.businessDate.slice(0, 7) >= currentObligationMonth
    && currentLifecycle.mode === "snapshotted"
    && isApprovedLifecycleStatus(currentLifecycle.billingPeriodStatus)
    ? { obligationMonth: currentObligationMonth, status: "approved_ready_for_dispatch" as const }
    : null;

  return {
    businessDate: monthFacts.businessDate,
    operatingMonth: monthFacts.operatingMonth,
    context: monthFacts.context,
    financialFocus,
    water,
    gas,
    obligations,
    handoff,
    attentions: deriveAttentions(sourceWork, financialFacts, monthFacts.upcoming, financialFocus, sourceWorkActionable, monthFacts.businessDate),
    worthNoting: financialFacts.worthNoting,
    completed: deriveCompleted(sourceWork, financialFacts.obligations),
    quickActions: [
      "upload_sedapal_bill",
      "upload_water_meter_readings",
      "upload_gas_supplier_bill",
      "upload_gas_readings",
    ],
  };
}

function buildSourceWorkFacts(
  financialFacts: BuildingMonthFinancialFacts,
): SourceWorkFacts {
  const waterReadings = countCompletedWaterReadings(financialFacts);

  return {
    water: {
      commonWaterBillPresent: financialFacts.commonWaterBill !== null,
      meterReadingCount: waterReadings.readingCount,
      meterReadingExpectedCount: waterReadings.expectedCount,
      meterReadingCompleteCount: waterReadings.completedCount,
      readingsReady: hasCompleteWaterReadings({
        eligibleUnitIds: financialFacts.unitRows.filter((row) => row.unit_type_code === "condo").map((row) => row.id),
        readings: financialFacts.waterReadings,
      }),
    },
    gas: {
      supplierBillCount: financialFacts.gasBills.length,
      gasReadingCount: financialFacts.gasReadings.length,
      gasUnitCount: financialFacts.unitRows.filter((row) => row.has_gas_service).length,
    },
  };
}

function buildUpcomingFacts(
  financialFacts: BuildingMonthFinancialFacts,
  upcomingObligationMonth: string,
): UpcomingFacts {
  const obligations = financialFacts.obligationSnapshot
    ? buildMonthlyObligationSummaryFromSnapshot(financialFacts, upcomingObligationMonth, financialFacts.obligationSnapshot)
    : buildMonthlyObligationSummaryFromFacts(financialFacts, upcomingObligationMonth);
  const waterBill = financialFacts.commonWaterBill;
  const includedGasBills = financialFacts.gasBills.filter((bill) => bill.processed_at === null);
  const charges = countChargeRows(financialFacts, upcomingObligationMonth);

  return {
    sourceReadingMonth: financialFacts.sourceReadingMonth,
    obligations,
    commonWaterBill: waterBill
      ? {
          id: waterBill.id,
          amount: String(waterBill.amount),
          bill_date: waterBill.bill_date ?? null,
          status: String(waterBill.status),
        }
      : null,
    gas: {
      supplierBillCount: includedGasBills.length,
      supplierBillTotal: includedGasBills.reduce((sum, bill) => sum + Number(bill.amount), 0).toFixed(2),
    },
    charges,
    worthNoting: deriveUnitChargeWorthNoting(financialFacts, upcomingObligationMonth),
    obligationLifecycle: financialFacts.obligationLifecycle,
  };
}

export function deriveGulianaDashboardMonths(businessNow: Date) {
  const operatingMonth = `${businessNow.getUTCFullYear()}-${String(businessNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const upcomingObligationMonth = nextMonthKey(operatingMonth) ?? operatingMonth;
  return { operatingMonth, upcomingObligationMonth };
}

export function deriveDashboardContext(businessNow: Date): DashboardContext {
  return businessNow.getUTCDate() === 1 ? "open" : "close";
}

export const getGulianaDashboardFacts = cache(async (): Promise<QueryResult<GulianaDashboardFacts>> => {
  const businessNow = await getBusinessNow();
  const { operatingMonth, upcomingObligationMonth } = deriveGulianaDashboardMonths(businessNow);
  const context = deriveDashboardContext(businessNow);
  const building = getFixedBuildingIdentity();
  const factsResult = await loadBuildingMonthFinancialFacts({
    buildingId: building.id,
    obligationMonth: operatingMonth,
  });

  if (factsResult.error) {
    return { data: null as never, error: factsResult.error };
  }

  if (!factsResult.data) {
    return { data: null as never, error: "Building month facts unavailable." };
  }

  const upcomingFacts = factsResult.data.upcoming;
  const sourceWork = buildSourceWorkFacts(upcomingFacts);

  return {
    data: {
      businessDate: businessNow.toISOString().slice(0, 10),
      operatingMonth,
      upcomingObligationMonth,
      context,
      sourceWork,
      current: buildUpcomingFacts(factsResult.data.current, operatingMonth),
      upcoming: buildUpcomingFacts(upcomingFacts, upcomingObligationMonth),
    },
    error: null,
  };
});

export async function getDashboardMonthFacts() {
  return getGulianaDashboardFacts();
}
