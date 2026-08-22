import { getCurrentBuilding, getUnitById, listUnits } from "../units";
import { isChargeEligibleForMonth } from "../charges/month";
import { composeMonthlyObligation } from "./core";
import { createMonthlyObligationProviders } from "./providers";
import { buildChargeMap, buildFixedAssessmentMap, buildGasCalculationInputFromFacts, buildWaterPreviewFromFacts, loadBuildingMonthFinancialFacts } from "./owner-facts";
import { buildMonthlyObligationSummaryFromFacts } from "./summary-facts";
import { calculateGasCharges } from "../gas/calculation";
import { isPerfLoggingEnabled } from "@/server/perf";

export function selectBuildingOwnerDirectCharges(
  charges: Array<{
    amount: number;
    schedule: "one_off" | "recurring";
    effective_from_month: string;
    effective_to_month: string | null;
    owner_id: string | null;
    unit_id: string | null;
  }>,
  obligationMonth: string,
) {
  return charges.filter((row) => {
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

export async function getUnitMonthlyObligationForBuilding({
  unit,
  obligationMonth,
  buildingId,
  buildingName,
}: {
  unit: {
    unitId: string;
    unitNumber: string;
    unitAccountId: string;
    participationPercentage: number | null;
  };
  obligationMonth: string;
  buildingId: string;
  buildingName: string;
}) {
  const startedAt = Date.now();
  const buildingFactsStartedAt = Date.now();
  const buildingFactsResult = await loadBuildingMonthFinancialFacts({
    buildingId,
    obligationMonth,
  });
  const buildingMonthFactsMs = buildingFactsResult.elapsedMs ?? (Date.now() - buildingFactsStartedAt);

  if (buildingFactsResult.error) return { data: null as never, error: buildingFactsResult.error };
  if (!buildingFactsResult.data) return { data: null as never, error: "Building month financial facts not found." };

  const buildingFacts = buildingFactsResult.data;
  const selectedUnitFacts = buildingFacts.unitRows.find((row) => row.id === unit.unitId) ?? null;
  const calculationStartedAt = Date.now();
  const fixedAssessmentByUnitId = buildFixedAssessmentMap(buildingFacts.plan, buildingFacts.planYear, [
    {
      id: unit.unitId,
      participation_percentage: unit.participationPercentage,
    },
  ]);
  const waterByUnitId = new Map([
    [
      unit.unitId,
      buildWaterPreviewFromFacts(
        {
          id: unit.unitId,
          unit_type_id: selectedUnitFacts?.unit_type_id ?? "",
          unit_type_code: selectedUnitFacts?.unit_type_code ?? "condo",
          has_meter: selectedUnitFacts?.has_meter ?? false,
        },
        obligationMonth,
        buildingFacts,
      ),
    ],
  ]);
  const gasCalculation = calculateGasCharges(buildGasCalculationInputFromFacts(buildingFacts, obligationMonth));
  const chargesByUnitId = buildChargeMap(buildingFacts.charges, obligationMonth, [unit.unitId]);

  const compositionStartedAt = Date.now();
  const composed = await composeMonthlyObligation(
    {
      obligationMonth,
      buildingId,
      buildingName,
    },
    [
      {
        unitId: unit.unitId,
        unitNumber: unit.unitNumber,
        unitAccountId: unit.unitAccountId,
        unitTypeCode: selectedUnitFacts?.unit_type_code ?? "condo",
        hasMeter: selectedUnitFacts?.has_meter ?? false,
        participationPercentage: unit.participationPercentage,
      },
    ],
    createMonthlyObligationProviders({
      fixedAssessmentByUnitId,
      waterByUnitId,
      gasByUnitId: new Map([
        [
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
        ],
      ]),
      chargesByUnitId,
    }),
  );

  if (isPerfLoggingEnabled()) {
    console.info(
      [
        "[UNIT_OBLIGATION_PERF]",
        `unit=${unit.unitNumber}`,
        `month=${obligationMonth}`,
        `data_remote_requests=${buildingFactsResult.requestCount}`,
        `building_month_facts_source=${buildingFactsResult.source ?? "remote"}`,
        `elapsed_ms=${Date.now() - startedAt}`,
        `building_month_facts_ms=${buildingMonthFactsMs}`,
        `financial_calculation_ms=${Date.now() - calculationStartedAt}`,
        `composition_ms=${Date.now() - compositionStartedAt}`,
      ].join(" "),
    );
  }

  return { data: composed, error: null };
}

export async function getMonthlyObligationSummary({ obligationMonth }: { obligationMonth: string }) {
  const startedAt = Date.now();
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };
  const summaryStartedAt = Date.now();
  const buildingFactsResult = await loadBuildingMonthFinancialFacts({
    buildingId: buildingResult.data.id,
    obligationMonth,
  });
  if (buildingFactsResult.error) return { data: null as never, error: buildingFactsResult.error };
  if (!buildingFactsResult.data) return { data: null as never, error: "Building month facts unavailable." };

  const summary = buildMonthlyObligationSummaryFromFacts(buildingFactsResult.data, obligationMonth);
  const elapsedMs = Date.now() - startedAt;
  if (isPerfLoggingEnabled()) {
    console.info(
      [
        "[OBLIGATIONS_SUMMARY_PERF]",
        `month=${obligationMonth}`,
        `data_remote_requests=${buildingFactsResult.requestCount}`,
        `building_month_facts_source=${buildingFactsResult.source ?? "remote"}`,
        `elapsed_ms=${elapsedMs}`,
        `building_month_facts_ms=${buildingFactsResult.elapsedMs ?? summaryStartedAt - startedAt}`,
        `summary_projection_ms=${Date.now() - summaryStartedAt}`,
      ].join(" "),
    );
  }

  return {
    data: summary,
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
export { getOwnerMonthlyObligation } from "./owner";
