import { getUnitFixedMonthlyAssessment } from "../budget-plans";
import { getUnitChargesForObligationMonth } from "../charges";
import { getGasChargePreviewsForUnit } from "../gas";
import { getWaterChargePreviewsForUnit } from "../water";
import type { ProviderMap } from "./core";
import type { UnitFixedMonthlyAssessmentState } from "../budget-plans/types";
import type { August2026MeteredWaterChargeState, CommonWaterChargePreviewState } from "../water";
import type { GasChargePreviewState } from "../gas/provider";

type MonthlyObligationProviderDeps = {
  getWaterChargePreviewsForUnit?: typeof getWaterChargePreviewsForUnit;
  getGasChargePreviewsForUnit?: typeof getGasChargePreviewsForUnit;
  getUnitFixedMonthlyAssessment?: typeof getUnitFixedMonthlyAssessment;
  getUnitChargesForObligationMonth?: typeof getUnitChargesForObligationMonth;
  fixedAssessmentByUnitId?: Map<string, UnitFixedMonthlyAssessmentState>;
  waterByUnitId?: Map<string, { meteredWater: August2026MeteredWaterChargeState; commonWater: CommonWaterChargePreviewState }>;
  gasByUnitId?: Map<string, GasChargePreviewState>;
  chargesByUnitId?: Map<string, { amount: string; lineItems: Array<{ chargeId: string; description: string; amount: string; effectiveFromMonth: string; effectiveToMonth: string | null; }> }>;
};

export function createMonthlyObligationProviders(deps: MonthlyObligationProviderDeps = {}): ProviderMap {
  const getWaterChargePreviews = deps.getWaterChargePreviewsForUnit ?? getWaterChargePreviewsForUnit;
  const getGasChargePreviews = deps.getGasChargePreviewsForUnit ?? getGasChargePreviewsForUnit;
  const getFixedAssessment = deps.getUnitFixedMonthlyAssessment ?? getUnitFixedMonthlyAssessment;
  const getUnitCharges = deps.getUnitChargesForObligationMonth ?? getUnitChargesForObligationMonth;

  return {
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

      const cachedFixed = deps.fixedAssessmentByUnitId?.get(unit.unitId);
      const result: UnitFixedMonthlyAssessmentState = cachedFixed ?? (await getFixedAssessment({ unitId: unit.unitId, planYear }));
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

      const cached = deps.waterByUnitId?.get(unit.unitId);
      const result = cached ?? (await getWaterChargePreviews(unit.unitId, context.obligationMonth));
      const meteredWater = result.meteredWater;
      if (meteredWater.status === "available") {
        return {
          status: "available",
          amount: meteredWater.data.amount,
          currency: "PEN",
          provenance: "server/water",
          sourceMonth: context.obligationMonth,
        };
      }
      if (meteredWater.status === "not-applicable") {
        return { status: "not_applicable", provenance: "server/water", sourceMonth: context.obligationMonth };
      }
      return {
        status: "missing",
        blocker: meteredWater.message,
        provenance: "server/water",
        sourceMonth: context.obligationMonth,
      };
    },
    common_water: async ({ context, unit }) => {
      if (unit.unitTypeCode !== "condo") {
        return { status: "not_applicable", provenance: "server/water/monthly-ledger", sourceMonth: context.obligationMonth };
      }

      const cached = deps.waterByUnitId?.get(unit.unitId);
      const result = cached ?? (await getWaterChargePreviews(unit.unitId, context.obligationMonth));
      const commonWater = result.commonWater;
      if (commonWater.status === "available") {
        return {
          status: "available",
          amount: commonWater.data.unitCommonWaterCharge,
          currency: "PEN",
          provenance: "server/water",
          sourceMonth: context.obligationMonth,
        };
      }
      if (commonWater.status === "not-applicable") {
        return { status: "not_applicable", provenance: "server/water", sourceMonth: context.obligationMonth };
      }
      return {
        status: "missing",
        blocker: commonWater.message,
        provenance: "server/water",
        sourceMonth: context.obligationMonth,
      };
    },
    gas: async ({ context, unit }) => {
      if (unit.unitTypeCode !== "condo") {
        return { status: "not_applicable", provenance: "server/gas/provider", sourceMonth: context.obligationMonth };
      }

      const cached = deps.gasByUnitId?.get(unit.unitId);
      const result: GasChargePreviewState = cached ?? (await getGasChargePreviews(unit.unitId, context.obligationMonth));
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
      const cached = deps.chargesByUnitId?.get(unit.unitId);
      const result = cached
        ? { error: null, data: cached }
        : await getUnitCharges(unit.unitId, context.obligationMonth);
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
}
