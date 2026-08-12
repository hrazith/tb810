import { getUnitFixedMonthlyAssessment } from "../budget-plans";
import { getCurrentBuilding, getUnitById, listUnits } from "../units";
import { getGasChargePreviewsForUnit } from "../gas";
import { getWaterChargePreviewsForUnit } from "../water";
import { getUnitChargesForObligationMonth } from "../charges";
import { composeMonthlyObligation, type ProviderMap } from "./core";

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

export type {
  MonthlyObligationComponent,
  MonthlyObligationComponentKey,
  MonthlyObligationComponentStatus,
  MonthlyObligationReadiness,
  MonthlyObligationResult,
  UnitMonthlyObligation,
} from "./types";
