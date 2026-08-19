import { getCurrentBuilding } from "@/server/units";
import type { OwnerSummary } from "@/server/owners/types";
import { composeMonthlyObligation } from "./core";
import { createMonthlyObligationProviders } from "./providers";
import { composeOwnerMonthlyObligation, type OwnerMonthlyObligationComposition } from "./owner-composition";
import type { MonthlyObligationResult } from "./types";
import {
  buildChargeMap,
  buildFixedAssessmentMap,
  buildGasCalculationInputFromFacts,
  buildWaterPreviewFromFacts,
  loadBuildingMonthFinancialFacts,
  loadOwnerMonthResponsibility,
} from "./owner-facts";
import { calculateGasCharges } from "@/server/gas/calculation";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

export type OwnerMonthlyObligationResult = {
  owner: OwnerSummary;
  obligation: MonthlyObligationResult;
  componentSummary: OwnerMonthlyObligationComposition["componentSummary"];
  ownerDirectCharges: OwnerMonthlyObligationComposition["ownerDirectCharges"];
  total: OwnerMonthlyObligationComposition["total"];
  readiness: OwnerMonthlyObligationComposition["readiness"];
  ownedUnitCount: number;
};

type OwnerPerfBreakdown = {
  buildingMonthFactsMs: number;
  ownerResponsibilityMs: number;
  unitCalculationMs: number;
  ownerCompositionMs: number;
  totalMs: number;
};

function logOwnerObligationPerf(input: {
  owner: string;
  month: string;
  responsibleUnits: number;
  dataRemoteRequests: number;
  elapsedMs: number;
  breakdown: OwnerPerfBreakdown;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(
    [
      "[OWNER_OBLIGATION_PERF]",
      `owner=${input.owner}`,
      `month=${input.month}`,
      `responsible_units=${input.responsibleUnits}`,
      `data_remote_requests=${input.dataRemoteRequests}`,
      `elapsed_ms=${input.elapsedMs}`,
      `building_month_facts_ms=${input.breakdown.buildingMonthFactsMs}`,
      `owner_responsibility_ms=${input.breakdown.ownerResponsibilityMs}`,
      `unit_calculation_ms=${input.breakdown.unitCalculationMs}`,
      `owner_composition_ms=${input.breakdown.ownerCompositionMs}`,
    ].join(" "),
  );
}

export async function getOwnerMonthlyObligationForBuilding({
  ownerId,
  obligationMonth,
  buildingId,
  buildingName,
}: {
  ownerId: string;
  obligationMonth: string;
  buildingId: string;
  buildingName: string;
}): Promise<QueryResult<OwnerMonthlyObligationResult | null>> {
  const startedAt = Date.now();
  const breakdown: OwnerPerfBreakdown = {
    buildingMonthFactsMs: 0,
    ownerResponsibilityMs: 0,
    unitCalculationMs: 0,
    ownerCompositionMs: 0,
    totalMs: 0,
  };
  let dataRemoteRequests = 0;
  const buildingFactsStarted = Date.now();
  const buildingFactsPromise = loadBuildingMonthFinancialFacts({ buildingId, obligationMonth });
  const responsibilityPromise = loadOwnerMonthResponsibility({ ownerId, obligationMonth, buildingId });

  const [buildingFactsResult, responsibilityResult] = await Promise.all([buildingFactsPromise, responsibilityPromise]);
  breakdown.buildingMonthFactsMs = Date.now() - buildingFactsStarted;
  breakdown.ownerResponsibilityMs = 0;
  if (buildingFactsResult.error) return { data: null, error: buildingFactsResult.error };
  if (responsibilityResult.error) return { data: null, error: responsibilityResult.error };
  dataRemoteRequests = (buildingFactsResult.requestCount ?? 0) + (responsibilityResult.requestCount ?? 0);

  const buildingFacts = buildingFactsResult.data;
  const responsibility = responsibilityResult.data;
  if (!buildingFacts) return { data: null, error: "Building month financial facts not found." };
  if (!responsibility) return { data: null, error: "Owner month responsibility not found." };
  const units = responsibility.responsibleUnits;
  const fixedAssessmentByUnitId = buildFixedAssessmentMap(
    buildingFacts.plan,
    buildingFacts.planYear,
    buildingFacts.unitRows,
  );
  const gasCalculation = calculateGasCharges(buildGasCalculationInputFromFacts(buildingFacts, obligationMonth));
  const waterByUnitId = new Map(
    units.map((unit) => [
      unit.unitId,
      buildWaterPreviewFromFacts(
        {
          id: unit.unitId,
          unit_type_id: buildingFacts.unitRows.find((row) => row.id === unit.unitId)?.unit_type_id ?? "",
          unit_type_code: unit.unitTypeCode,
          has_meter: unit.hasMeter,
        },
        obligationMonth,
        buildingFacts,
      ),
    ]),
  );
  const chargesByUnitId = buildChargeMap(buildingFacts.charges, obligationMonth, units.map((unit) => unit.unitId));
  breakdown.unitCalculationMs = Date.now() - buildingFactsStarted - breakdown.buildingMonthFactsMs;

  const obligation = await composeMonthlyObligation(
    { obligationMonth, buildingId, buildingName },
    units.map((unit) => ({
      unitId: unit.unitId,
      unitNumber: unit.unitNumber,
      unitAccountId: unit.unitId,
      unitTypeCode: unit.unitTypeCode,
      hasMeter: unit.hasMeter,
      participationPercentage: unit.participationPercentage,
    })),
    createMonthlyObligationProviders({
      fixedAssessmentByUnitId,
      waterByUnitId,
      gasByUnitId: new Map(
        units.map((unit) => [
          unit.unitId,
          gasCalculation.blockers.length > 0
            ? { status: "unavailable", message: gasCalculation.blockers.join(" ") || "Gas lookup data is incomplete." }
            : {
                status: "available",
                data: {
                  ...gasCalculation,
                  sourceReadingMonthLabel: buildingFacts.sourceReadingMonth,
                  billingMonthLabel: obligationMonth,
                },
              },
        ]),
      ),
      chargesByUnitId,
    }),
  );
  breakdown.ownerCompositionMs = Date.now() - buildingFactsStarted - breakdown.buildingMonthFactsMs - breakdown.unitCalculationMs;

  const ownerConsolidation = composeOwnerMonthlyObligation({
    ownerId: responsibility.owner.id,
    ownerReference: responsibility.owner.owner_reference,
    ownerName: responsibility.owner.full_name,
    obligationMonth,
    units: obligation.units,
    ownerDirectCharges: responsibility.ownerDirectCharges,
  });
  breakdown.totalMs = Date.now() - startedAt;
  logOwnerObligationPerf({
    owner: ownerId,
    month: obligationMonth,
    responsibleUnits: units.length,
    dataRemoteRequests,
    elapsedMs: breakdown.totalMs,
    breakdown,
  });

  return {
    data: {
      owner: responsibility.owner,
      obligation,
      componentSummary: ownerConsolidation.componentSummary,
      ownerDirectCharges: ownerConsolidation.ownerDirectCharges,
      total: ownerConsolidation.total,
      readiness: ownerConsolidation.readiness,
      ownedUnitCount: units.length,
    },
    error: null,
  };
}

export async function getOwnerMonthlyObligation({
  ownerId,
  obligationMonth,
}: {
  ownerId: string;
  obligationMonth: string;
}): Promise<QueryResult<OwnerMonthlyObligationResult | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: "Current building not found." };

  return getOwnerMonthlyObligationForBuilding({
    ownerId,
    obligationMonth,
    buildingId: buildingResult.data.id,
    buildingName: buildingResult.data.name,
  });
}
