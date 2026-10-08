import { cache } from "react";

import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { isChargeEligibleForMonth, nextMonthKey, previousMonthKey } from "@/server/charges/month";
import { buildMonthlyObligationSummaryFromFacts, buildMonthlyObligationSummaryFromSnapshot } from "@/server/obligations/summary-facts";
import { loadBuildingMonthFinancialFacts, type BuildingMonthFinancialFacts } from "@/server/obligations/owner-facts";
import { isApprovedPackage, isHandedOffPackage, selectFinancialFocus } from "@/server/obligations/package-selection";
import { loadGiulianaPackageProgression } from "@/server/obligations/progression";
import { buildFinancialReviewFingerprint } from "@/server/obligations/snapshot";
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
  reviewFingerprint: string;
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
export type DashboardAudience = "giuliana" | "carlos";
export type CarlosApprovalState = "ready" | "overdue" | "approved" | "not_ready";
export type CarlosJourneyState = "building" | "ready" | "blocked" | "ready_for_approval" | "approval_overdue" | "approved";

export const MONTHLY_OBLIGATION_APPROVAL_CUTOFF_DAY = 5;

export type GulianaDashboardFacts = {
  businessDate: string;
  operatingMonth: string;
  upcomingObligationMonth: string;
  context: DashboardContext;
  sourceWork: SourceWorkFacts;
  mostRecentHandoff?: {
    obligationMonth: string;
    status: string;
  } | null;
  pendingReviews: Array<{
    billingPeriodId: string;
    obligationMonth: string;
    status: string;
    outstanding: boolean;
    chronologicallyActionable: boolean;
    approvalEligible: boolean;
  }>;
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

export type DashboardDomainState = "complete" | "incomplete" | "blocked";

export type DashboardPackageState = "ready" | "not_ready" | "blocked" | "handed_off";

export type GulianaDashboardProjection = {
  businessDate: string;
  operatingMonth: string;
  context: DashboardContext;
  financialFocus: DashboardFinancialFocus;
  water: {
    state: DashboardSectionState;
    completion: "incomplete" | "complete";
    emphasis: "normal" | "compressed" | "attention";
    meterReadingsEmphasis: "normal" | "compressed" | "attention";
    billEmphasis: "normal" | "compressed" | "attention";
    billPresent: boolean;
    meterReadingsComplete: boolean;
    /** Water domain card: meter readings + Sedapal, for the active package. */
    domainState: DashboardDomainState;
  };
  gas: {
    state: DashboardSectionState;
    completion: "incomplete" | "complete";
    emphasis: "normal" | "compressed" | "attention";
    readingsEmphasis: "normal" | "compressed" | "attention";
    supplierBillsEmphasis: "normal" | "compressed" | "attention";
    supplierBillsPresent: boolean;
    readingsComplete: boolean;
    /** Gas domain card: meter readings + supplier bills, for the active package. */
    domainState: DashboardDomainState;
  };
  obligations: {
    state: DashboardSectionState;
    emphasis: "normal" | "compressed" | "attention";
    ready: boolean;
    blocked: boolean;
    readiness: "ready_for_carlos" | "awaiting_approval" | "not_ready";
    /** Package vocabulary: Blocked once its financial readiness deadline passes without being ready. */
    packageState: DashboardPackageState;
    statusLabel: string;
  };
  /**
   * The active package once its obligation month has begun and it has not been
   * handed off: it owns the top region, ahead of any earlier handoff.
   */
  activeResponsibility: {
    obligationMonth: string;
    state: Exclude<DashboardPackageState, "handed_off">;
  } | null;
  handoff: {
    obligationMonth: string;
    status: "awaiting_carlos_approval" | "approved_ready_for_dispatch";
  } | null;
  attentions: DashboardAttention[];
  worthNoting: DashboardWorthNoting[];
  completed: Array<{
    key: "water" | "gas" | "obligations" | "prior_obligations";
    state: "complete" | "compressed";
    obligationMonth?: string;
    status?: "awaiting_carlos_approval" | "approved_ready_for_dispatch";
  }>;
  quickActions: DashboardQuickActionKey[];
};

export type CarlosDashboardProjection = {
  businessDate: string;
  financialFocus: DashboardFinancialFocus;
  obligationMonth: string;
  eligibleUnitCount: number;
  total: string | null;
  components: UpcomingFacts["obligations"]["components"];
  financialReadiness: "ready" | "blocked";
  financialBlockers: string[];
  billingPeriodId: string | null;
  billingPeriodStatus: string | null;
  approvalState: CarlosApprovalState;
  journeyState: CarlosJourneyState;
  pendingReviews: Array<{
    billingPeriodId: string;
    obligationMonth: string;
    status: string;
    outstanding: boolean;
    chronologicallyActionable: boolean;
    approvalEligible: boolean;
  }>;
};

export type CarlosApprovalAttention = {
  billingPeriodId: string;
  obligationMonth: string;
  outstanding: boolean;
  chronologicallyActionable: boolean;
  approvalEligible: boolean;
  happened: string;
};

export type CarlosObligationReviewDetail = {
  obligationMonth: string;
  billingPeriodId: string | null;
  billingPeriodStatus: string | null;
  total: string | null;
  components: UpcomingFacts["obligations"]["components"];
  financialReadiness: "ready" | "blocked";
  financialBlockers: string[];
  reviewFingerprint: string;
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
  return isApprovedPackage({ mode: "snapshotted", status });
}

function deriveFinancialFocus(monthFacts: GulianaDashboardFacts): DashboardFinancialFocus {
  return selectFinancialFocus({
    mode: monthFacts.current.obligationLifecycle.mode,
    status: monthFacts.current.obligationLifecycle.billingPeriodStatus,
  });
}

function hasBlockedObligationComponent(obligations: UpcomingFacts["obligations"]) {
  return obligations.components.fixed_assessment.state === "blocked"
    || obligations.components.metered_water.state === "blocked"
    || obligations.components.common_water.state === "blocked"
    || obligations.components.gas.state === "blocked";
}

function isReadyToApprove(facts: UpcomingFacts) {
  return facts.obligations.total !== null && !hasBlockedObligationComponent(facts.obligations);
}

export function financialReadinessDeadline(obligationMonth: string) {
  const previousMonth = previousMonthKey(obligationMonth);
  if (!previousMonth) return null;
  const year = Number(previousMonth.slice(0, 4));
  const month = Number(previousMonth.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${previousMonth}-${String(lastDay).padStart(2, "0")}`;
}

function getFinancialBlockers(facts: UpcomingFacts) {
  const reasons = [
    facts.obligations.components.fixed_assessment.reason,
    facts.obligations.components.metered_water.reason,
    facts.obligations.components.common_water.reason,
    facts.obligations.components.gas.reason,
  ].filter((reason): reason is string => Boolean(reason));

  return reasons.length > 0
    ? [...new Set(reasons)]
    : facts.obligations.total === null
      ? ["Monthly obligation total is unavailable."]
      : [];
}

export function projectCarlosDashboard(monthFacts: GulianaDashboardFacts): CarlosDashboardProjection {
  const financialFocus = deriveFinancialFocus(monthFacts);
  const currentLifecycle = monthFacts.current.obligationLifecycle;
  const hasCurrentApprovalLifecycle = currentLifecycle.billingPeriodId !== null
    && (currentLifecycle.billingPeriodStatus === "ready_for_review" || isApprovedLifecycleStatus(currentLifecycle.billingPeriodStatus));
  const financialFacts = hasCurrentApprovalLifecycle ? monthFacts.current : monthFacts[financialFocus];
  const lifecycle = financialFacts.obligationLifecycle;
  const currentMonth = monthFacts.businessDate.slice(0, 7) === financialFacts.obligations.obligationMonth;
  const financiallyReady = isReadyToApprove(financialFacts);
  const readyForApproval = currentMonth
    && lifecycle.billingPeriodStatus === "ready_for_review"
    && financiallyReady;
  const approvalState = readyForApproval
    ? currentMonth && Number(monthFacts.businessDate.slice(8, 10)) > MONTHLY_OBLIGATION_APPROVAL_CUTOFF_DAY ? "overdue" : "ready"
    : currentMonth && lifecycle.mode === "snapshotted" && isApprovedLifecycleStatus(lifecycle.billingPeriodStatus) ? "approved" : "not_ready";
  const readinessDeadline = financialReadinessDeadline(financialFacts.obligations.obligationMonth);
  const journeyState = approvalState === "overdue"
    ? "approval_overdue"
    : approvalState === "ready"
      ? "ready_for_approval"
      : approvalState === "approved"
        ? "approved"
        : financiallyReady
          ? "ready"
          : lifecycle.mode === "live" && readinessDeadline !== null && monthFacts.businessDate < readinessDeadline
            ? "building"
            : "blocked";

  return {
    businessDate: monthFacts.businessDate,
    financialFocus,
    obligationMonth: financialFacts.obligations.obligationMonth,
    eligibleUnitCount: financialFacts.obligations.eligibleUnitCount,
    total: financialFacts.obligations.total,
    components: financialFacts.obligations.components,
    financialReadiness: financiallyReady ? "ready" : "blocked",
    financialBlockers: getFinancialBlockers(financialFacts),
    billingPeriodId: lifecycle.billingPeriodId,
    billingPeriodStatus: lifecycle.billingPeriodStatus,
    approvalState,
    journeyState,
    pendingReviews: monthFacts.pendingReviews ?? [],
  };
}

export function deriveCarlosApprovalAttentions(
  pendingReviews: Array<{ billingPeriodId: string; obligationMonth: string; outstanding: boolean; chronologicallyActionable: boolean; approvalEligible: boolean }>,
): CarlosApprovalAttention[] {
  return pendingReviews.map((review) => ({
    ...review,
    happened: `${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${review.obligationMonth}-01T00:00:00Z`))} obligations are ${review.approvalEligible ? "ready for your approval" : "ready for review"}`,
  }));
}

function isSourceWorkLate(businessDate: string, sourceReadingMonth: string) {
  return sourceReadingMonth <= businessDate.slice(0, 7)
    && Number(businessDate.slice(8, 10)) >= 7;
}

function deriveAttentions(
  sourceWork: SourceWorkFacts,
  facts: UpcomingFacts,
  financialFocus: DashboardFinancialFocus,
  sourceWorkActionable: boolean,
  businessDate: string,
): DashboardAttention[] {
  const attentions: DashboardAttention[] = [];
  const sourceMonthLabel = monthLabelFromMonthKey(facts.sourceReadingMonth);
  const upcomingMonthLabel = monthLabelFromMonthKey(facts.obligations.obligationMonth);
  const sourceWorkMonthLabel = monthLabelFromMonthKey(facts.sourceReadingMonth);
  const sourceWorkObligationMonthLabel = monthLabelFromMonthKey(facts.obligations.obligationMonth);
  const waterMissingCount = Math.max(sourceWork.water.meterReadingExpectedCount - sourceWork.water.meterReadingCompleteCount, 0);
  const gasMissingCount = Math.max(sourceWork.gas.gasUnitCount - sourceWork.gas.gasReadingCount, 0);
  const currentSedapalMissing = !facts.commonWaterBill && facts.obligations.components.common_water.state === "blocked";
  const sourceWorkLate = isSourceWorkLate(businessDate, facts.sourceReadingMonth);
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
        ? `${sourceWorkMonthLabel} Sedapal bill is still missing for ${sourceWorkObligationMonthLabel} obligations.`
        : `Sedapal bill is missing for ${sourceMonthLabel}.`,
      impact: sourceSedapalLate
        ? `${sourceWorkObligationMonthLabel} water obligations cannot be completed.`
        : `${upcomingMonthLabel} water obligations cannot be completed.`,
    });
  }

  if (sourceWorkLate && waterMissingCount > 0) {
    attentions.push({
      source: "water",
      happened: `${waterMissingCount} ${sourceWorkMonthLabel} Water readings are still missing for ${sourceWorkObligationMonthLabel} obligations.`,
      impact: `${sourceWorkObligationMonthLabel} water obligations cannot be completed.`,
    });
  }

  if (sourceWorkLate && gasMissingCount > 0) {
    attentions.push({
      source: "gas",
      happened: `${gasMissingCount} ${sourceWorkMonthLabel} Gas readings are still missing for ${sourceWorkObligationMonthLabel} obligations.`,
      impact: `${sourceWorkObligationMonthLabel} gas obligations cannot be completed.`,
    });
  }

  const suppressWaterDownstream = sourceWorkActionable
    ? !sourceWork.water.commonWaterBillPresent || waterMissingCount > 0
    : currentSedapalMissing;
  const suppressGasDownstream = sourceWorkActionable && gasMissingCount > 0;
  const financialBlockers = financialFocus === "current" && (
    facts.obligations.obligationMonth === businessDate.slice(0, 7) || sourceWorkActionable
  ) ? [
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
  sourceReadingMonth: string,
  sourceWorkActionable: boolean,
  businessDate: string,
): Omit<GulianaDashboardProjection["water"], "domainState"> {
  const complete = sourceWork.water.commonWaterBillPresent && sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount;
  const active = sourceWork.water.commonWaterBillPresent || sourceWork.water.meterReadingCount > 0;
  const blocked = sourceWorkActionable && (obligations.components.common_water.state === "blocked" || obligations.components.metered_water.state === "blocked");
  const missingReadings = sourceWork.water.meterReadingExpectedCount > sourceWork.water.meterReadingCompleteCount;
  const missingBill = !sourceWork.water.commonWaterBillPresent
    && (sourceWork.water.meterReadingExpectedCount > 0 || sourceWork.water.meterReadingCount > 0);
  const late = isSourceWorkLate(businessDate, sourceReadingMonth) && (missingReadings || missingBill);
  const meterReadingsEmphasis = isSourceWorkLate(businessDate, sourceReadingMonth) && missingReadings
    ? "attention"
    : sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount
      ? "compressed"
      : "normal";
  const billEmphasis = isSourceWorkLate(businessDate, sourceReadingMonth) && missingBill
    ? "attention"
    : sourceWork.water.commonWaterBillPresent ? "compressed" : "normal";

  return {
    state: blocked ? "blocked" : complete ? "complete" : active ? "active" : "waiting",
    completion: complete ? "complete" : "incomplete",
    emphasis: blocked || late ? "attention" : complete ? "compressed" : "normal",
    meterReadingsEmphasis,
    billEmphasis,
    billPresent: sourceWork.water.commonWaterBillPresent,
    meterReadingsComplete: sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount,
  };
}

function deriveGasState(
  sourceWork: SourceWorkFacts,
  obligations: UpcomingFacts["obligations"],
  sourceReadingMonth: string,
  sourceWorkActionable: boolean,
  businessDate: string,
): Omit<GulianaDashboardProjection["gas"], "domainState"> {
  const complete = sourceWork.gas.supplierBillCount > 0 && sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount;
  const active = sourceWork.gas.supplierBillCount > 0 || sourceWork.gas.gasReadingCount > 0;
  const blocked = sourceWorkActionable && obligations.components.gas.state === "blocked";
  const late = isSourceWorkLate(businessDate, sourceReadingMonth) && sourceWork.gas.gasUnitCount > sourceWork.gas.gasReadingCount;
  const readingsEmphasis = late
    ? "attention"
    : sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount ? "compressed" : "normal";
  const supplierBillsEmphasis = sourceWork.gas.supplierBillCount > 0 ? "compressed" : "normal";

  return {
    state: blocked ? "blocked" : complete ? "complete" : active ? "active" : "waiting",
    completion: complete ? "complete" : "incomplete",
    emphasis: blocked || late ? "attention" : complete ? "compressed" : "normal",
    readingsEmphasis,
    supplierBillsEmphasis,
    supplierBillsPresent: sourceWork.gas.supplierBillCount > 0,
    readingsComplete: sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount,
  };
}

function deriveObligationState(
  obligations: UpcomingFacts["obligations"],
  lifecycle: UpcomingFacts["obligationLifecycle"],
  businessDate: string,
): Omit<GulianaDashboardProjection["obligations"], "packageState" | "statusLabel"> {
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
    readiness: ready ? lifecycleVisible && lifecycle?.billingPeriodStatus === "ready_for_review" ? "awaiting_approval" : "ready_for_carlos" : "not_ready",
  };
}

/**
 * Package vocabulary for Giuliana. A package not yet handed off is Blocked once
 * its financial readiness deadline (last day of the preceding month) passes
 * without it being ready; the same boundary Carlos's journey uses.
 */
export function deriveGulianaPackageState(
  facts: Pick<UpcomingFacts, "obligations" | "obligationLifecycle">,
  ready: boolean,
  businessDate: string,
): DashboardPackageState {
  if (isHandedOffPackage({ mode: facts.obligationLifecycle.mode, status: facts.obligationLifecycle.billingPeriodStatus })) return "handed_off";
  if (ready) return "ready";
  const deadline = financialReadinessDeadline(facts.obligations.obligationMonth);
  return deadline !== null && businessDate >= deadline ? "blocked" : "not_ready";
}

function obligationStatusLabel(
  financialFocus: DashboardFinancialFocus,
  readiness: GulianaDashboardProjection["obligations"]["readiness"],
  packageState: DashboardPackageState,
) {
  if (financialFocus === "upcoming") return "Live preview";
  if (readiness === "awaiting_approval") return "Awaiting approval";
  if (readiness === "ready_for_carlos") return "Ready for handoff";
  return packageState === "blocked" ? "Blocked" : "Not ready";
}

// A domain card is Blocked only when the package itself is Blocked and that
// domain's component prevents it; missing source work before then is Incomplete.
function deriveDomainState(complete: boolean, componentBlocked: boolean, packageState: DashboardPackageState): DashboardDomainState {
  if (complete && !componentBlocked) return "complete";
  return packageState === "blocked" && componentBlocked ? "blocked" : "incomplete";
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
  const operationalWorthNoting = monthFacts.upcoming.worthNoting;
  const sourceWorkActionable = monthFacts.context === "close" && !isHandedOffPackage({
    mode: monthFacts.current.obligationLifecycle.mode,
    status: monthFacts.current.obligationLifecycle.billingPeriodStatus,
  });
  const obligationState = deriveObligationState(financialFacts.obligations, financialFacts.obligationLifecycle, monthFacts.businessDate);
  const packageState = deriveGulianaPackageState(financialFacts, obligationState.ready, monthFacts.businessDate);
  const obligations = {
    ...obligationState,
    packageState,
    statusLabel: obligationStatusLabel(financialFocus, obligationState.readiness, packageState),
  };
  const components = financialFacts.obligations.components;
  const waterState = deriveWaterState(sourceWork, financialFacts.obligations, financialFacts.sourceReadingMonth, sourceWorkActionable, monthFacts.businessDate);
  const water = {
    ...waterState,
    domainState: deriveDomainState(
      waterState.completion === "complete",
      components.metered_water.state === "blocked" || components.common_water.state === "blocked",
      packageState,
    ),
  };
  const gasState = deriveGasState(sourceWork, financialFacts.obligations, financialFacts.sourceReadingMonth, sourceWorkActionable, monthFacts.businessDate);
  const gas = {
    ...gasState,
    // Supplier-bill presence never completes Gas: an empty pool is valid, missing readings are not.
    domainState: deriveDomainState(gasState.readingsComplete, components.gas.state === "blocked", packageState),
  };
  const currentLifecycle = monthFacts.current.obligationLifecycle;
  const currentObligationMonth = monthFacts.current.obligations.obligationMonth;
  const handoffSource = monthFacts.mostRecentHandoff ?? (
    currentLifecycle.billingPeriodStatus
      ? { obligationMonth: currentObligationMonth, status: currentLifecycle.billingPeriodStatus }
      : null
  );
  const handoff = handoffSource
    ? {
        obligationMonth: handoffSource.obligationMonth,
        status: isApprovedLifecycleStatus(handoffSource.status)
          ? "approved_ready_for_dispatch" as const
          : "awaiting_carlos_approval" as const,
      }
    : null;
  // Once the active package's own obligation month has begun and it is still
  // Giuliana's (not handed off), it is the active operational responsibility.
  const activeObligationMonth = financialFacts.obligations.obligationMonth;
  const activeResponsibility = packageState !== "handed_off" && monthFacts.businessDate.slice(0, 7) >= activeObligationMonth
    ? { obligationMonth: activeObligationMonth, state: packageState }
    : null;
  const completed = deriveCompleted(sourceWork, financialFacts.obligations);
  if (activeResponsibility && handoff && handoff.obligationMonth < activeObligationMonth) {
    completed.push({ key: "prior_obligations", state: "compressed", obligationMonth: handoff.obligationMonth, status: handoff.status });
  }

  return {
    businessDate: monthFacts.businessDate,
    operatingMonth: monthFacts.operatingMonth,
    context: monthFacts.context,
    financialFocus,
    water,
    gas,
    obligations,
    activeResponsibility,
    handoff,
    attentions: deriveAttentions(sourceWork, financialFacts, financialFocus, sourceWorkActionable, monthFacts.businessDate),
    worthNoting: operationalWorthNoting,
    completed,
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
      supplierBillCount: financialFacts.gasBills.filter((bill) => bill.processed_at === null).length,
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
    reviewFingerprint: buildFinancialReviewFingerprint(financialFacts),
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

export function buildCarlosObligationReviewDetail(financialFacts: BuildingMonthFinancialFacts): CarlosObligationReviewDetail {
  const facts = buildUpcomingFacts(financialFacts, financialFacts.obligationMonth);
  const financiallyReady = isReadyToApprove(facts);

  return {
    obligationMonth: facts.obligations.obligationMonth,
    billingPeriodId: financialFacts.obligationLifecycle.billingPeriodId,
    billingPeriodStatus: financialFacts.obligationLifecycle.billingPeriodStatus,
    total: facts.obligations.total,
    components: facts.obligations.components,
    financialReadiness: financiallyReady ? "ready" : "blocked",
    financialBlockers: getFinancialBlockers(facts),
    reviewFingerprint: facts.reviewFingerprint,
  };
}

export async function getCarlosObligationReviewDetail(obligationMonth: string): Promise<QueryResult<CarlosObligationReviewDetail>> {
  const building = getFixedBuildingIdentity();
  const factsResult = await loadBuildingMonthFinancialFacts({
    buildingId: building.id,
    obligationMonth,
  });
  if (factsResult.error || !factsResult.data) {
    return { data: null as never, error: factsResult.error ?? "Building month facts unavailable." };
  }

  return { data: buildCarlosObligationReviewDetail(factsResult.data.current), error: null };
}

export function deriveGulianaDashboardMonths(businessNow: Date) {
  const operatingMonth = `${businessNow.getUTCFullYear()}-${String(businessNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const upcomingObligationMonth = nextMonthKey(operatingMonth) ?? operatingMonth;
  return { operatingMonth, upcomingObligationMonth };
}

export function deriveDashboardContext(businessNow: Date): DashboardContext {
  return businessNow.getUTCDate() === 1 ? "open" : "close";
}

export function selectDashboardPackageMonth({
  audience,
  activePackage,
  mostRecentHandoff,
  pendingReviews = [],
}: {
  audience: DashboardAudience;
  activePackage: { obligationMonth: string };
  mostRecentHandoff: { obligationMonth: string; status: string } | null;
  pendingReviews?: Array<{ obligationMonth: string; status: string }>;
}) {
  if (audience === "carlos") {
    const oldestReview = pendingReviews.find((review) => review.status === "ready_for_review");
    if (oldestReview) return oldestReview.obligationMonth;
    if (mostRecentHandoff?.status === "ready_for_review") return mostRecentHandoff.obligationMonth;
  }
  return activePackage.obligationMonth;
}

export async function loadDashboardFacts(audience: DashboardAudience = "giuliana"): Promise<QueryResult<GulianaDashboardFacts>> {
  const businessNow = await getBusinessNow();
  const { operatingMonth, upcomingObligationMonth } = deriveGulianaDashboardMonths(businessNow);
  const context = deriveDashboardContext(businessNow);
  const building = getFixedBuildingIdentity();
  const progressionResult = await loadGiulianaPackageProgression({
    buildingId: building.id,
    startMonth: operatingMonth,
  });
  if (progressionResult.error || !progressionResult.data) {
    return { data: null as never, error: progressionResult.error ?? "Giuliana package progression unavailable." };
  }

  const packageMonth = selectDashboardPackageMonth({
    audience,
    activePackage: progressionResult.data.activePackage,
    mostRecentHandoff: progressionResult.data.mostRecentHandoff,
    pendingReviews: progressionResult.data.pendingReviews,
  });
  const activeUpcomingObligationMonth = nextMonthKey(packageMonth) ?? packageMonth;
  const factsResult = await loadBuildingMonthFinancialFacts({
    buildingId: building.id,
    obligationMonth: packageMonth,
  });

  if (factsResult.error) {
    return { data: null as never, error: factsResult.error };
  }

  if (!factsResult.data) {
    return { data: null as never, error: "Building month facts unavailable." };
  }

  const current = buildUpcomingFacts(factsResult.data.current, packageMonth);
  const upcoming = buildUpcomingFacts(factsResult.data.upcoming, activeUpcomingObligationMonth);
  const sourceWork = buildSourceWorkFacts(factsResult.data.current);

  return {
    data: {
      businessDate: businessNow.toISOString().slice(0, 10),
      operatingMonth,
      upcomingObligationMonth,
      context,
      sourceWork,
      mostRecentHandoff: progressionResult.data.mostRecentHandoff,
      pendingReviews: progressionResult.data.pendingReviews,
      current,
      upcoming,
    },
    error: null,
  };
}

export const getGulianaDashboardFacts = cache(async (): Promise<QueryResult<GulianaDashboardFacts>> => loadDashboardFacts("giuliana"));

export const getCarlosDashboardFacts = cache(async (): Promise<QueryResult<GulianaDashboardFacts>> => loadDashboardFacts("carlos"));

export async function getDashboardMonthFacts() {
  return getGulianaDashboardFacts();
}
