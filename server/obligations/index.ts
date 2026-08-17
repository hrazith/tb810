import { createClient } from "@/lib/supabase/server";
import { getMonthlyFixedAssessmentSummary } from "../budget-plans";
import { getCurrentBuilding, getUnitById, listUnits } from "../units";
import { getMonthlyGasObligationSummary } from "../gas";
import { getMonthlyWaterObligationSummary } from "../water";
import { isChargeEligibleForMonth } from "../charges/month";
import { composeMonthlyObligation } from "./core";
import { createMonthlyObligationProviders } from "./providers";
import {
  buildMonthlyObligationSummary,
  type MonthlyObligationSummaryComponent,
} from "./summary";

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
  const ownerDirectCharges = await getBuildingOwnerDirectChargeSummary({
    buildingId: buildingResult.data.id,
    obligationMonth,
  });
  if (ownerDirectCharges.error) return { data: null as never, error: ownerDirectCharges.error };

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
      ownerDirectChargeAmount: ownerDirectCharges.data.amount,
      ownerDirectChargeCount: ownerDirectCharges.data.count,
    }),
    error: null,
  };
}

async function getBuildingOwnerDirectChargeSummary({
  buildingId,
  obligationMonth,
}: {
  buildingId: string;
  obligationMonth: string;
}): Promise<{ data: { amount: string; count: number }; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_charges")
    .select("amount, schedule, effective_from_month, effective_to_month, owner_id, unit_id")
    .eq("building_id", buildingId)
    .not("owner_id", "is", null)
    .is("unit_id", null);
  if (error) return { data: { amount: "0.00", count: 0 }, error: error.message };

  const applicableCharges = selectBuildingOwnerDirectCharges(data ?? [], obligationMonth);

  const amount = applicableCharges.reduce((total, row) => total + Number(row.amount), 0).toFixed(2);
  return { data: { amount, count: applicableCharges.length }, error: null };
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
