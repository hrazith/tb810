import { getUnitFixedMonthlyAssessment } from "../budget-plans";
import { getUnitChargesForObligationMonth } from "../charges";
import { getGasChargePreviewsForUnit } from "../gas";
import { getWaterChargePreviewsForUnit } from "../water";
import type { ProviderMap } from "./core";

export function createMonthlyObligationProviders(): ProviderMap {
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
}
