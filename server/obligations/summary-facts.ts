import { calculateFixedMonthlyAssessmentAmount } from "@/server/budget-plans";
import { calculateGasCharges } from "@/server/gas/calculation";
import { buildWaterPreviewFromFacts, type BuildingMonthFinancialFacts } from "./owner-facts";
import { buildMonthlyObligationSummary, type MonthlyObligationSummary } from "./summary";
import { isChargeEligibleForMonth } from "@/server/charges/month";

function formatAmount(total: number) {
  return total.toFixed(2);
}

type SummaryComponent = {
  state: "available" | "blocked";
  amount: string | null;
  reason?: string;
};

function selectApplicableUnitCharges(
  charges: BuildingMonthFinancialFacts["charges"],
  eligibleUnitIds: string[],
  obligationMonth: string,
) {
  return charges.filter((row) => {
    if (row.owner_id != null || row.unit_id == null) return false;
    if (!eligibleUnitIds.includes(row.unit_id)) return false;
    const effectiveFromMonth = row.effective_from_month.slice(0, 7);
    const effectiveToMonth = row.effective_to_month ? row.effective_to_month.slice(0, 7) : null;
    return isChargeEligibleForMonth({
      schedule: row.schedule,
      effectiveFromMonth,
      effectiveToMonth,
      obligationMonth,
    });
  });
}

function buildFixedAssessmentSummaryFromFacts(financialFacts: BuildingMonthFinancialFacts): SummaryComponent {
  if (!financialFacts.plan) {
    return { state: "blocked", amount: null, reason: "Fixed Monthly Assessment is unavailable because the Budget Plan has not been entered." };
  }

  const eligibleUnits = financialFacts.unitRows.filter((unit) => unit.participation_percentage !== null);
  let total = 0;
  for (const unit of eligibleUnits) {
    const amount = calculateFixedMonthlyAssessmentAmount(financialFacts.plan.monthly_operating_budget, unit.participation_percentage ?? 0);
    if (!amount) {
      return {
        state: "blocked",
        amount: null,
        reason: "Fixed Monthly Assessment is unavailable because a Unit has an invalid Assessment Percentage.",
      };
    }
    total += Number(amount);
  }

  return { state: "available", amount: formatAmount(total) };
}

function buildWaterSummaryFromFacts(financialFacts: BuildingMonthFinancialFacts, obligationMonth: string) {
  const eligibleUnits = financialFacts.unitRows.filter((row) => row.unit_type_code === "condo");
  const meteredUnits = eligibleUnits.filter((row) => row.has_meter);
  if (!financialFacts.commonWaterBill) {
    return {
      metered_water: { state: "blocked" as const, amount: null, reason: "Sedapal water bill has not been entered yet." },
      common_water: { state: "blocked" as const, amount: null, reason: "Sedapal water bill has not been entered yet." },
      eligibleUnitCount: eligibleUnits.length,
    };
  }

  const previews = meteredUnits.map((unit) =>
    buildWaterPreviewFromFacts(
      {
        id: unit.id,
        unit_type_id: unit.unit_type_id,
        unit_type_code: unit.unit_type_code,
        has_meter: unit.has_meter,
      },
      obligationMonth,
      financialFacts,
    ),
  );

  const failedPreview = previews.find((preview) => preview.meteredWater.status !== "available" || preview.commonWater.status !== "available");
  if (failedPreview) {
    const reason =
      failedPreview.meteredWater.status !== "available"
        ? failedPreview.meteredWater.message
        : failedPreview.commonWater.status === "available"
          ? "Water lookup data is incomplete."
          : failedPreview.commonWater.message;
    return {
      metered_water: { state: "blocked" as const, amount: null, reason },
      common_water: { state: "blocked" as const, amount: null, reason },
      eligibleUnitCount: eligibleUnits.length,
    };
  }

  const meteredAmount = previews.reduce((sum, preview) => sum + Number(preview.meteredWater.status === "available" ? preview.meteredWater.data.amount : "0.00"), 0);
  const firstPreview = previews[0];
  const commonWaterAmount = firstPreview && firstPreview.commonWater.status === "available" ? firstPreview.commonWater.data.unitCommonWaterCharge : null;
  return {
    metered_water: { state: "available" as const, amount: formatAmount(meteredAmount) },
    common_water: commonWaterAmount
      ? { state: "available" as const, amount: commonWaterAmount }
      : { state: "blocked" as const, amount: null, reason: "Water lookup data is incomplete." },
    eligibleUnitCount: eligibleUnits.length,
  };
}

function buildGasSummaryFromFacts(financialFacts: BuildingMonthFinancialFacts, obligationMonth: string) {
  const gasCalculation = calculateGasCharges({
    sourceReadingMonth: financialFacts.sourceReadingMonth,
    obligationMonth,
    supplierBills: financialFacts.gasBills.map((bill) => ({
      billId: bill.id,
      amount: String(bill.amount),
      status: bill.processed_at ? "processed" : "unprocessed",
    })),
    units: financialFacts.unitRows.map((row) => {
      const reading = financialFacts.gasReadings.find((item) => item.unit_id === row.id) ?? null;
      return {
        unitId: row.id,
        unitNumber: row.unit_number,
        unitTypeCode: row.unit_type_code,
        hasGasService: Boolean(row.has_gas_service),
        consumption: reading?.consumption == null ? null : String(reading.consumption),
      };
    }),
  });

  if (gasCalculation.blockers.length > 0) {
    return {
      state: "blocked" as const,
      amount: null,
      reason: gasCalculation.blockers.join(" "),
    };
  }

  const amount = gasCalculation.unitCharges.reduce((sum, charge) => sum + Number(charge.amount), 0);
  return { state: "available" as const, amount: formatAmount(amount) };
}

function buildChargeSummaryFromFacts(
  financialFacts: BuildingMonthFinancialFacts,
  obligationMonth: string,
) {
  const eligibleUnitIds = financialFacts.unitRows.filter((unit) => unit.unit_type_code === "condo").map((unit) => unit.id);
  const applicableCharges = selectApplicableUnitCharges(financialFacts.charges, eligibleUnitIds, obligationMonth);
  const amount = applicableCharges.reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    amount: formatAmount(amount),
    count: applicableCharges.length,
  };
}

function buildOwnerDirectChargeSummaryFromFacts(financialFacts: BuildingMonthFinancialFacts, obligationMonth: string) {
  const applicableCharges = financialFacts.charges.filter((row) => {
    if (row.owner_id == null || row.unit_id != null) return false;
    const effectiveFromMonth = row.effective_from_month.slice(0, 7);
    const effectiveToMonth = row.effective_to_month ? row.effective_to_month.slice(0, 7) : null;
    return isChargeEligibleForMonth({
      schedule: row.schedule,
      effectiveFromMonth,
      effectiveToMonth,
      obligationMonth,
    });
  });
  const amount = applicableCharges.reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    amount: formatAmount(amount),
    count: applicableCharges.length,
  };
}

export function buildMonthlyObligationSummaryFromFacts(
  financialFacts: BuildingMonthFinancialFacts,
  obligationMonth: string,
): MonthlyObligationSummary {
  const fixedAssessment = buildFixedAssessmentSummaryFromFacts(financialFacts);
  const water = buildWaterSummaryFromFacts(financialFacts, obligationMonth);
  const gas = buildGasSummaryFromFacts(financialFacts, obligationMonth);
  const otherCharges = buildChargeSummaryFromFacts(financialFacts, obligationMonth);
  const ownerDirectCharges = buildOwnerDirectChargeSummaryFromFacts(financialFacts, obligationMonth);

  return buildMonthlyObligationSummary({
    obligationMonth,
    eligibleUnitCount: financialFacts.unitRows.filter((unit) => unit.unit_type_code === "condo").length,
    fixedAssessment,
    meteredWater: water.metered_water,
    commonWater: water.common_water,
    gas,
    otherChargeAmount: otherCharges.amount,
    otherChargeCount: otherCharges.count,
    ownerDirectChargeAmount: ownerDirectCharges.amount,
    ownerDirectChargeCount: ownerDirectCharges.count,
  });
}
