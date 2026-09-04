import { cache } from "react";

import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { nextMonthKey } from "@/server/charges/month";
import { buildMonthlyObligationSummaryFromFacts } from "@/server/obligations/summary-facts";
import { loadBuildingMonthFinancialFacts, type BuildingMonthFinancialFacts } from "@/server/obligations/owner-facts";

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
  };
  gas: {
    supplierBillCount: number;
    gasReadingCount: number;
    gasUnitCount: number;
  };
};

type UpcomingFacts = {
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
};

export type GulianaDashboardFacts = {
  businessDate: string;
  operatingMonth: string;
  upcomingObligationMonth: string;
  sourceWork: SourceWorkFacts;
  upcoming: UpcomingFacts;
};

export type DashboardSectionState = "waiting" | "active" | "complete" | "blocked" | "compressed";

export type DashboardQuickActionKey =
  | "upload_sedapal_bill"
  | "upload_water_meter_readings"
  | "upload_gas_supplier_bill"
  | "upload_gas_readings";

export type DashboardException = {
  source: "obligations" | "water" | "gas";
  message: string;
};

export type GulianaDashboardProjection = {
  businessDate: string;
  operatingMonth: string;
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
  };
  exceptions: DashboardException[];
  completed: Array<{
    key: "water" | "gas" | "obligations";
    state: "complete" | "compressed";
  }>;
  quickActions: DashboardQuickActionKey[];
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

function deriveExceptions(
  sourceWork: SourceWorkFacts,
  facts: UpcomingFacts["obligations"],
): DashboardException[] {
  const seen = new Set<string>();
  const exceptions: DashboardException[] = [];
  if (sourceWork.water.meterReadingExpectedCount > 0 && sourceWork.water.meterReadingCompleteCount < sourceWork.water.meterReadingExpectedCount) {
    exceptions.push({ source: "water", message: "Required water readings are missing." });
  }
  for (const message of [
    facts.components.fixed_assessment.reason,
    facts.components.metered_water.reason,
    facts.components.common_water.reason,
    facts.components.gas.reason,
  ]) {
    if (!message) continue;
    const key = `obligations:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    exceptions.push({ source: "obligations", message });
  }
  return exceptions;
}

function deriveWaterState(
  sourceWork: SourceWorkFacts,
  obligations: UpcomingFacts["obligations"],
): GulianaDashboardProjection["water"] {
  const complete = sourceWork.water.commonWaterBillPresent && sourceWork.water.meterReadingCompleteCount >= sourceWork.water.meterReadingExpectedCount;
  const active = sourceWork.water.commonWaterBillPresent || sourceWork.water.meterReadingCount > 0;
  const blocked = obligations.components.common_water.state === "blocked" || obligations.components.metered_water.state === "blocked";

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
): GulianaDashboardProjection["gas"] {
  const complete = sourceWork.gas.supplierBillCount > 0 && sourceWork.gas.gasReadingCount >= sourceWork.gas.gasUnitCount;
  const active = sourceWork.gas.supplierBillCount > 0 || sourceWork.gas.gasReadingCount > 0;
  const blocked = obligations.components.gas.state === "blocked";

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
): GulianaDashboardProjection["obligations"] {
  const blocked = obligations.components.fixed_assessment.state === "blocked"
    || obligations.components.metered_water.state === "blocked"
    || obligations.components.common_water.state === "blocked"
    || obligations.components.gas.state === "blocked";
  const ready = obligations.total !== null && !blocked;

  return {
    state: blocked ? "blocked" : ready ? "complete" : "active",
    emphasis: blocked ? "attention" : ready ? "compressed" : "normal",
    ready,
    blocked,
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
  const obligations = deriveObligationState(monthFacts.upcoming.obligations);
  const water = deriveWaterState(sourceWork, monthFacts.upcoming.obligations);
  const gas = deriveGasState(sourceWork, monthFacts.upcoming.obligations);

  return {
    businessDate: monthFacts.businessDate,
    operatingMonth: monthFacts.operatingMonth,
    water,
    gas,
    obligations,
    exceptions: deriveExceptions(sourceWork, monthFacts.upcoming.obligations),
    completed: deriveCompleted(sourceWork, monthFacts.upcoming.obligations),
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
  const obligations = buildMonthlyObligationSummaryFromFacts(financialFacts, upcomingObligationMonth);
  const waterBill = financialFacts.commonWaterBill;
  const includedGasBills = financialFacts.gasBills.filter((bill) => bill.processed_at === null);
  const charges = countChargeRows(financialFacts, upcomingObligationMonth);

  return {
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
  };
}

export function deriveGulianaDashboardMonths(businessNow: Date) {
  const operatingMonth = `${businessNow.getUTCFullYear()}-${String(businessNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const upcomingObligationMonth = nextMonthKey(operatingMonth) ?? operatingMonth;
  return { operatingMonth, upcomingObligationMonth };
}

export const getGulianaDashboardFacts = cache(async (): Promise<QueryResult<GulianaDashboardFacts>> => {
  const businessNow = await getBusinessNow();
  const { operatingMonth, upcomingObligationMonth } = deriveGulianaDashboardMonths(businessNow);
  const building = getFixedBuildingIdentity();
  const upcomingFactsResult = await loadBuildingMonthFinancialFacts({
    buildingId: building.id,
    obligationMonth: upcomingObligationMonth,
  });

  if (upcomingFactsResult.error) {
    return { data: null as never, error: upcomingFactsResult.error };
  }

  if (!upcomingFactsResult.data) {
    return { data: null as never, error: "Building month facts unavailable." };
  }

  const sourceWork = buildSourceWorkFacts(upcomingFactsResult.data);

  return {
    data: {
      businessDate: businessNow.toISOString().slice(0, 10),
      operatingMonth,
      upcomingObligationMonth,
      sourceWork,
      upcoming: buildUpcomingFacts(upcomingFactsResult.data, upcomingObligationMonth),
    },
    error: null,
  };
});

export async function getDashboardMonthFacts() {
  return getGulianaDashboardFacts();
}
