import { createClient } from "@/lib/supabase/server";
import { getMonthlyFixedAssessmentSummary, getUnitFixedMonthlyAssessment } from "../budget-plans";
import { getCurrentBuilding, getUnitById, listUnits } from "../units";
import { getMonthlyGasObligationSummary, getGasChargePreviewsForUnit } from "../gas";
import { getMonthlyWaterObligationSummary, getWaterChargePreviewsForUnit } from "../water";
import { getUnitChargesForObligationMonth } from "../charges";
import { isChargeEligibleForMonth } from "../charges/month";
import { composeMonthlyObligation, type ProviderMap } from "./core";
import {
  buildMonthlyObligationSummary,
  type MonthlyObligationSummaryComponent,
} from "./summary";

function createMonthlyObligationProviders(): ProviderMap {
  const providers: ProviderMap = {
    fixed_assessment: async ({ context, unit }) => {
      const planYear = Number(context.obligationMonth.slice(0, 4));
      if (!Number.isFinite(planYear)) {
        return {
          status: "blocked",
          blocker: `Invalid obligation month: ${context.obligationMonth}.`,
          provenance: "server/budget-plans",
          sourceMonth: context.obligationMonth,
        };
      }

      const result = await getUnitFixedMonthlyAssessment({ unitId: unit.unitId, planYear });
      if (result.status !== "ready") {
        const blocker = result.message;
        return result.reason === "budget-plan-missing"
          ? { status: "missing", blocker, provenance: "server/budget-plans", sourceMonth: context.obligationMonth }
          : { status: "blocked", blocker, provenance: "server/budget-plans", sourceMonth: context.obligationMonth };
      }

      return {
        status: "available",
        amount: result.data.fixedMonthlyAssessment,
        currency: result.data.currency,
        provenance: "server/budget-plans",
        sourceMonth: context.obligationMonth,
      };
    },
    metered_water: async ({ context, unit }) => {
      if (unit.unitTypeCode !== "condo" || !unit.hasMeter) {
        return { status: "not_applicable", provenance: "server/water/monthly-ledger", sourceMonth: context.obligationMonth };
      }

      const result = await getWaterChargePreviewsForUnit(unit.unitId, context.obligationMonth);
      if (result.meteredWater.status === "available") {
        return {
          status: "available",
          amount: result.meteredWater.data.amount,
          currency: "PEN",
          provenance: "server/water",
          sourceMonth: context.obligationMonth,
        };
      }
      if (result.meteredWater.status === "not-applicable") {
        return { status: "not_applicable", provenance: "server/water", sourceMonth: context.obligationMonth };
      }
      return {
        status: "missing",
        blocker: result.meteredWater.message,
        provenance: "server/water",
        sourceMonth: context.obligationMonth,
      };
    },
    common_water: async ({ context, unit }) => {
      if (unit.unitTypeCode !== "condo") {
        return { status: "not_applicable", provenance: "server/water/monthly-ledger", sourceMonth: context.obligationMonth };
      }

      const result = await getWaterChargePreviewsForUnit(unit.unitId, context.obligationMonth);
      if (result.commonWater.status === "available") {
        return {
          status: "available",
          amount: result.commonWater.data.unitCommonWaterCharge,
          currency: "PEN",
          provenance: "server/water",
          sourceMonth: context.obligationMonth,
        };
      }
      if (result.commonWater.status === "not-applicable") {
        return { status: "not_applicable", provenance: "server/water", sourceMonth: context.obligationMonth };
      }
      return {
        status: "missing",
        blocker: result.commonWater.message,
        provenance: "server/water",
        sourceMonth: context.obligationMonth,
      };
    },
    gas: async ({ context, unit }) => {
      if (unit.unitTypeCode !== "condo") {
        return { status: "not_applicable", provenance: "server/gas/provider", sourceMonth: context.obligationMonth };
      }

      const result = await getGasChargePreviewsForUnit(unit.unitId, context.obligationMonth);
      if (result.status === "available") {
        return {
          status: "available",
          amount: result.data.unitCharges.find((charge) => charge.unitId === unit.unitId)?.amount ?? "0.00",
          currency: "PEN",
          provenance: "server/gas",
          sourceMonth: result.data.sourceReadingMonth,
        };
      }
      if (result.status === "not-applicable") {
        return { status: "not_applicable", provenance: "server/gas", sourceMonth: context.obligationMonth };
      }
      return {
        status: "missing",
        blocker: result.message,
        provenance: "server/gas",
        sourceMonth: context.obligationMonth,
      };
    },
    other_charge: async ({ context, unit }) => {
      const result = await getUnitChargesForObligationMonth(unit.unitId, context.obligationMonth);
      if (result.error) {
        return {
          status: "blocked",
          blocker: result.error,
          provenance: "server/charges",
          sourceMonth: context.obligationMonth,
        };
      }
      if (result.data.lineItems.length === 0) {
        return { status: "not_applicable", provenance: "server/charges", sourceMonth: context.obligationMonth };
      }
      return {
        status: "available",
        amount: result.data.amount,
        currency: "PEN",
        provenance: "server/charges",
        sourceMonth: context.obligationMonth,
        lineItems: result.data.lineItems,
      };
    },
  };

  return providers;
}

export async function getMonthlyObligation({ obligationMonth }: { obligationMonth: string }) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const unitsResult = await listUnits();
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };

  return {
    data: await composeMonthlyObligation(
      {
        obligationMonth,
        buildingId: buildingResult.data.id,
        buildingName: buildingResult.data.name,
      },
      unitsResult.data.map((unit) => ({
        unitId: unit.id,
        unitNumber: unit.unit_number,
        unitAccountId: unit.id,
        unitTypeCode: unit.unit_type_code,
        hasMeter: Boolean(unit.has_meter),
        participationPercentage: unit.participation_percentage ?? null,
      })),
      createMonthlyObligationProviders(),
    ),
    error: null,
  };
}

export async function getUnitMonthlyObligation({
  unitId,
  obligationMonth,
}: {
  unitId: string;
  obligationMonth: string;
}) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const unitResult = await getUnitById(unitId);
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  if (!unitResult.data) return { data: null as never, error: "Unit not found." };

  const unit = unitResult.data;
  const composed = await composeMonthlyObligation(
    {
      obligationMonth,
      buildingId: buildingResult.data.id,
      buildingName: buildingResult.data.name,
    },
    [
      {
        unitId: unit.id,
        unitNumber: unit.unit_number,
        unitAccountId: unit.id,
        unitTypeCode: unit.unit_type_code,
        hasMeter: Boolean(unit.has_meter),
        participationPercentage: unit.participation_percentage ?? null,
      },
    ],
    createMonthlyObligationProviders(),
  );

  return { data: composed, error: null };
}

export async function getMonthlyObligationSummary({ obligationMonth }: { obligationMonth: string }) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const unitsResult = await listUnits();
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };

  const eligibleUnits = unitsResult.data.filter((unit) => unit.unit_type_code === "condo");
  const [fixedResult, waterResult, gasResult] = await Promise.all([
    getMonthlyFixedAssessmentSummary({ obligationMonth }),
    getMonthlyWaterObligationSummary({ obligationMonth }),
    getMonthlyGasObligationSummary({ obligationMonth }),
  ]);

  if (fixedResult.error) return { data: null as never, error: fixedResult.error };
  if (waterResult.metered_water.state === "blocked" && !waterResult.common_water.reason) {
    return { data: null as never, error: waterResult.metered_water.reason ?? "Water summary unavailable." };
  }
  if (gasResult.state === "blocked" && !gasResult.reason) {
    return { data: null as never, error: gasResult.reason ?? "Gas summary unavailable." };
  }

  const supabase = await createClient();
  const { data: charges, error: chargesError } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingResult.data.id);
  if (chargesError) return { data: null as never, error: chargesError.message };

  const applicableCharges = (charges ?? []).filter((row) => {
    if (row.owner_id != null || row.unit_id == null) return false;
    if (!eligibleUnits.some((unit) => unit.id === row.unit_id)) return false;
    const effectiveFromMonth = row.effective_from_month.slice(0, 7);
    const effectiveToMonth = row.effective_to_month ? row.effective_to_month.slice(0, 7) : null;
    return isChargeEligibleForMonth({
      schedule: row.schedule,
      effectiveFromMonth,
      effectiveToMonth,
      obligationMonth,
    });
  });

  const otherChargeAmount = applicableCharges.reduce((total, row) => total + Number(row.amount), 0);

  const fixedAssessmentComponent: MonthlyObligationSummaryComponent =
    fixedResult.data ?? {
      state: "blocked",
      amount: null,
      reason: fixedResult.error ?? "Fixed Monthly Assessment is unavailable.",
    };

  return {
    data: buildMonthlyObligationSummary({
      obligationMonth,
      eligibleUnitCount: eligibleUnits.length,
      fixedAssessment: fixedAssessmentComponent,
      meteredWater: waterResult.metered_water,
      commonWater: waterResult.common_water,
      gas: gasResult,
      otherChargeAmount: otherChargeAmount.toFixed(2),
      otherChargeCount: applicableCharges.length,
    }),
    error: null,
  };
}

export type {
  MonthlyObligationComponent,
  MonthlyObligationComponentKey,
  MonthlyObligationComponentStatus,
  MonthlyObligationReadiness,
  MonthlyObligationResult,
  UnitMonthlyObligation,
} from "./types";
