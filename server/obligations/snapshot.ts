import { createClient } from "@/lib/supabase/server";
import { calculateGasCharges } from "@/server/gas/calculation";
import { getCurrentBuilding } from "@/server/units";
import { composeMonthlyObligation } from "./core";
import {
  buildChargeMap,
  buildFixedAssessmentMap,
  buildGasCalculationInputFromFacts,
  buildWaterPreviewFromFacts,
  loadBuildingMonthFinancialFacts,
  monthKeyToDate,
  type BuildingMonthFinancialFacts,
} from "./owner-facts";
import { createMonthlyObligationProviders } from "./providers";
import type { MonthlyObligationResult } from "./types";
import { previousMonthKeyFromMonthKey } from "@/server/water/month-utils";

type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

type SnapshotRow = {
  unit_id: string;
  unit_account_id: string;
  obligation_type: "fixed_assessment" | "water_consumption" | "common_water" | "gas_consumption" | "other_charge";
  source_service_month: string;
  amount: string;
  currency_code: string;
  source_type: string;
  source_id: string;
  calculation_snapshot: Record<string, unknown>;
};

type SnapshotPayload = {
  rows: SnapshotRow[];
  gasBillIds: string[];
};

type UnitAccountRow = {
  id: string;
  unit_id: string;
  building_id: string;
  status: string;
};

type WaterReadingIdentity = {
  id: string;
  unit_id: string;
};

function asRecord(value: unknown) {
  return value as Record<string, unknown>;
}

function sourceIdFromBill(bill: unknown) {
  if (!bill) return null;
  const id = asRecord(bill).id;
  return typeof id === "string" ? id : null;
}

function buildSnapshotPayload(
  composed: MonthlyObligationResult,
  facts: BuildingMonthFinancialFacts,
  accountsByUnitId: Map<string, UnitAccountRow>,
  planId: string,
  waterReadingIdByUnitId: Map<string, string>,
): QueryResult<SnapshotPayload> {
  if (composed.readiness !== "ready" || composed.blockers.length > 0) {
    return { data: null, error: composed.blockers.join(" ") || "Monthly obligation package is incomplete." };
  }

  const gasBillIds = facts.gasBills.filter((bill) => !bill.processed_at).map((bill) => bill.id);
  const gasReadingIdByUnitId = new Map(
    facts.gasReadings
      .map((reading) => [reading.unit_id, asRecord(reading).id] as const)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const commonWaterBillId = sourceIdFromBill(facts.commonWaterBill);
  const rows: SnapshotRow[] = [];

  for (const unit of composed.units) {
    const account = accountsByUnitId.get(unit.unitId);
    if (!account) return { data: null, error: `No active Unit Account found for ${unit.unitNumber}.` };

    for (const component of unit.components) {
      if (component.status === "not_applicable") continue;
      if (component.status !== "available" || component.amount === null) {
        return { data: null, error: `Monthly obligation package is incomplete for ${unit.unitNumber}.` };
      }

      let obligationType: SnapshotRow["obligation_type"];
      let sourceType: string;
      let sourceId: string | null;
      let sourceIds: string[];

      if (component.key === "fixed_assessment") {
        obligationType = "fixed_assessment";
        sourceType = "budget_plan";
        sourceId = planId;
        sourceIds = [planId];
      } else if (component.key === "metered_water") {
        obligationType = "water_consumption";
        sourceType = "water_meter_reading";
        sourceId = waterReadingIdByUnitId.get(unit.unitId) ?? null;
        sourceIds = sourceId ? [sourceId] : [];
      } else if (component.key === "common_water") {
        obligationType = "common_water";
        sourceType = "sedapal_bill";
        sourceId = commonWaterBillId;
        sourceIds = sourceId ? [sourceId] : [];
      } else if (component.key === "gas") {
        obligationType = "gas_consumption";
        sourceType = gasBillIds.length > 0 ? "gas_supplier_bills" : "gas_meter_reading";
        const unitGasReadingId = gasReadingIdByUnitId.get(unit.unitId) ?? null;
        sourceId = gasBillIds[0] ?? unitGasReadingId;
        sourceIds = gasBillIds.length > 0 ? gasBillIds : unitGasReadingId ? [unitGasReadingId] : [];
      } else {
        obligationType = "other_charge";
        sourceType = "unit_charge";
        sourceIds = (component.lineItems ?? []).map((item) => item.chargeId);
        sourceId = sourceIds[0] ?? null;
      }

      if (!sourceId) return { data: null, error: `Missing provenance for ${component.key} on ${unit.unitNumber}.` };

      const sourceMonth = component.sourceMonth ?? facts.sourceReadingMonth;
      rows.push({
        unit_id: unit.unitId,
        unit_account_id: account.id,
        obligation_type: obligationType,
        source_service_month: monthKeyToDate(sourceMonth),
        amount: component.amount,
        currency_code: "PEN",
        source_type: sourceType,
        source_id: sourceId,
        calculation_snapshot: {
          component: component.key,
          sourceMonth,
          sourceIds,
          amount: component.amount,
        },
      });
    }
  }

  return { data: { rows, gasBillIds }, error: null };
}

async function getSnapshotCalculation({
  buildingId,
  buildingName,
  obligationMonth,
  facts,
}: {
  buildingId: string;
  buildingName: string;
  obligationMonth: string;
  facts: BuildingMonthFinancialFacts;
}) {
  const supabase = await createClient();
  const sourceReadingMonth = previousMonthKeyFromMonthKey(obligationMonth) ?? facts.sourceReadingMonth;
  const [accountsResult, planResult, waterIdentityResult] = await Promise.all([
    supabase
      .from("tb810_unit_accounts")
      .select("id, unit_id, building_id, status")
      .eq("building_id", buildingId)
      .eq("status", "active"),
    supabase
      .from("tb810_budget_plans")
      .select("id")
      .eq("building_id", buildingId)
      .eq("plan_year", Number(obligationMonth.slice(0, 4)))
      .maybeSingle(),
    supabase
      .from("tb810_meter_readings")
      .select("id, unit_id")
      .eq("building_id", buildingId)
      .eq("utility_type_id", facts.commonWaterType?.id ?? "")
      .eq("reading_month", monthKeyToDate(sourceReadingMonth)),
  ]);

  if (accountsResult.error) return { data: null, error: accountsResult.error.message };
  if (planResult.error) return { data: null, error: planResult.error.message };
  if (waterIdentityResult.error) return { data: null, error: waterIdentityResult.error.message };
  if (!planResult.data) return { data: null, error: "Budget Plan not found." };

  const accountsByUnitId = new Map<string, UnitAccountRow>();
  for (const row of (accountsResult.data ?? []) as UnitAccountRow[]) {
    if (accountsByUnitId.has(row.unit_id)) return { data: null, error: `Multiple active Unit Accounts found for ${row.unit_id}.` };
    accountsByUnitId.set(row.unit_id, row);
  }

  const waterReadingIdByUnitId = new Map<string, string>();
  for (const row of (waterIdentityResult.data ?? []) as WaterReadingIdentity[]) {
    if (waterReadingIdByUnitId.has(row.unit_id)) return { data: null, error: `Multiple Water readings found for ${row.unit_id}.` };
    waterReadingIdByUnitId.set(row.unit_id, row.id);
  }

  const fixedAssessmentByUnitId = buildFixedAssessmentMap(facts.plan, facts.planYear, facts.unitRows);
  const waterByUnitId = new Map(
    facts.unitRows.map((unit) => [
      unit.id,
      buildWaterPreviewFromFacts(
        {
          id: unit.id,
          unit_type_id: unit.unit_type_id,
          unit_type_code: unit.unit_type_code,
          has_meter: unit.has_meter,
        },
        obligationMonth,
        facts,
      ),
    ]),
  );
  const gasCalculation = calculateGasCharges(buildGasCalculationInputFromFacts(facts, obligationMonth));
  const gasByUnitId = new Map(
    facts.unitRows.map((unit) => [
      unit.id,
      gasCalculation.blockers.length > 0
        ? { status: "unavailable" as const, message: gasCalculation.blockers.join(" ") || "Gas lookup data is incomplete." }
        : {
            status: "available" as const,
            data: {
              ...gasCalculation,
              sourceReadingMonthLabel: facts.sourceReadingMonth,
              billingMonthLabel: obligationMonth,
            },
          },
    ]),
  );
  const chargesByUnitId = buildChargeMap(facts.charges, obligationMonth, facts.unitRows.map((unit) => unit.id));
  const composed = await composeMonthlyObligation(
    { obligationMonth, buildingId, buildingName },
    facts.unitRows.map((unit) => ({
      unitId: unit.id,
      unitNumber: unit.unit_number,
      unitAccountId: accountsByUnitId.get(unit.id)?.id ?? unit.id,
      unitTypeCode: unit.unit_type_code,
      hasMeter: unit.has_meter,
      participationPercentage: unit.participation_percentage,
    })),
    createMonthlyObligationProviders({ fixedAssessmentByUnitId, waterByUnitId, gasByUnitId, chargesByUnitId }),
  );

  return buildSnapshotPayload(composed, facts, accountsByUnitId, planResult.data.id, waterReadingIdByUnitId);
}

export async function createMonthlyObligationSnapshot({
  buildingId,
  buildingName,
  obligationMonth,
}: {
  buildingId: string;
  buildingName: string;
  obligationMonth: string;
}): Promise<QueryResult<{ billingPeriodId: string; status: string; obligationRowCount: number }>> {
  const factsResult = await loadBuildingMonthFinancialFacts({ buildingId, obligationMonth });
  if (factsResult.error || !factsResult.data) return { data: null, error: factsResult.error ?? "Building month facts unavailable." };
  const calculation = await getSnapshotCalculation({ buildingId, buildingName, obligationMonth, facts: factsResult.data.current });
  if (calculation.error || !calculation.data) return { data: null, error: calculation.error ?? "Snapshot calculation unavailable." };

  const supabase = await createClient();
  const periodYear = Number(obligationMonth.slice(0, 4));
  const periodMonth = Number(obligationMonth.slice(5, 7));
  const rpc = await (supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: { billingPeriodId: string; status: string; obligationRowCount: number } | null; error: { message: string } | null }>;
  }).rpc("tb810_create_monthly_obligation_snapshot", {
    p_building_id: buildingId,
    p_period_year: periodYear,
    p_period_month: periodMonth,
    p_rows: calculation.data.rows,
    p_gas_bill_ids: calculation.data.gasBillIds,
  });

  if (rpc.error) return { data: null, error: rpc.error.message };
  return { data: rpc.data, error: null };
}

export async function createCurrentBuildingMonthlyObligationSnapshot({ obligationMonth }: { obligationMonth: string }) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: "Current building not found." };
  return createMonthlyObligationSnapshot({
    buildingId: buildingResult.data.id,
    buildingName: buildingResult.data.name,
    obligationMonth,
  });
}

export { buildSnapshotPayload };
