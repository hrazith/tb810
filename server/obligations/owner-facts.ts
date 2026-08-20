import { createClient } from "@/lib/supabase/server";
import { getUnitFixedMonthlyAssessmentFromFacts } from "@/server/budget-plans";
import type { UnitFixedMonthlyAssessmentState } from "@/server/budget-plans/types";
import { calculateUpcomingUnitChargesFromFacts } from "@/server/charges";
import type { ChargeRecord } from "@/server/charges/types";
import { type GasCalculationInput } from "@/server/gas/calculation";
import { calculateWaterChargePreviewsForUnit, type WaterChargePreviewBundle } from "@/server/water";
import { previousMonthKeyFromMonthKey } from "@/server/water/month-utils";
import { classifyOwnershipRow } from "@/server/ownerships/classification";
import type { OwnershipRecord } from "@/server/ownerships/types";
import type { OwnerSummary } from "@/server/owners/types";
import type { UnitTypeCode } from "@/server/units/types";

function withRequestCount<T>(result: { data: T | null; error: string | null }, requestCount: number): { data: T | null; error: string | null; requestCount: number } {
  return { ...result, requestCount };
}

type CommonWaterBill = NonNullable<Parameters<typeof calculateWaterChargePreviewsForUnit>[0]["bill"]>;

export type BuildingMonthFinancialFacts = {
  obligationMonth: string;
  sourceReadingMonth: string;
  planYear: number;
  plan: { currency: string; monthly_operating_budget: string } | null;
  commonWaterType: { id: string; code: string; name: string } | null;
  commonWaterBill: CommonWaterBill;
  unitRows: Array<{
    id: string;
    unit_number: string;
    unit_type_id: string;
    unit_type_code: UnitTypeCode;
    has_meter: boolean;
    has_gas_service: boolean;
    participation_percentage: number | null;
  }>;
  waterReadings: Array<{
    unit_id: string;
    reading_end: number | null;
    consumption: number | null;
    reading_date: string;
    created_at: string;
  }>;
  gasBills: Array<{ id: string; amount: number | string; processed_at: string | null; invoice_date: string }>;
  gasReadings: Array<{
    unit_id: string;
    reading_month: string;
    current_reading: number | null;
    previous_reading: number | null;
    consumption: number | null;
  }>;
  charges: ChargeRecord[];
};

export type BuildingMonthFinancialFactsResult = {
  data: BuildingMonthFinancialFacts | null;
  error: string | null;
  requestCount: number;
};

export type OwnerMonthResponsibility = {
  owner: OwnerSummary;
  ownershipRows: Array<
    OwnershipRecord & {
      owner: { id: string; full_name: string; owner_reference: string; active: boolean };
      unit_number: string;
      unit_type_code: UnitTypeCode;
      unit_type_name: string;
      ownership_status: "current" | "scheduled" | "past";
      has_meter: boolean;
      has_gas_service: boolean;
      participation_percentage: number | null;
    }
  >;
  responsibleUnits: Array<{
    unitId: string;
    unitNumber: string;
    unitTypeCode: UnitTypeCode;
    hasMeter: boolean;
    hasGasService: boolean;
    participationPercentage: number | null;
  }>;
  ownerDirectCharges: {
    state: "available" | "blocked";
    amount: string;
    count: number;
    reason: string | null;
    lineItems: Array<{
      chargeId: string;
      description: string;
      amount: string;
      effectiveFromMonth: string;
      effectiveToMonth: string | null;
    }>;
  };
};

export type OwnerMonthResponsibilityResult = {
  data: OwnerMonthResponsibility | null;
  error: string | null;
  requestCount: number;
};

type BuildingMonthFinancialFactsRpcPayload = {
  plan?: { currency: string; monthly_operating_budget: number | string } | null;
  commonWaterType?: { id: string; code: string; name: string } | null;
  commonWaterBill?: CommonWaterBill | null;
  unitRows?: Array<{
    id: string;
    unit_number: string;
    unit_type_id: string;
    unit_type_code: UnitTypeCode;
    has_meter: boolean;
    has_gas_service: boolean;
    participation_percentage: number | null;
  }>;
  waterReadings?: BuildingMonthFinancialFacts["waterReadings"];
  gasBills?: BuildingMonthFinancialFacts["gasBills"];
  gasReadings?: BuildingMonthFinancialFacts["gasReadings"];
  charges?: ChargeRecord[];
};

function monthLabelFromKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function selectChargeRows(charges: ChargeRecord[], obligationMonth: string) {
  return charges.filter((row) => {
    if (row.owner_id != null || row.unit_id == null) return false;
    const effectiveFromMonth = row.effective_from_month.slice(0, 7);
    const effectiveToMonth = row.effective_to_month ? row.effective_to_month.slice(0, 7) : null;
    const eligible =
      row.schedule === "one_off"
        ? effectiveFromMonth === obligationMonth
        : effectiveFromMonth <= obligationMonth && (effectiveToMonth === null || effectiveToMonth >= obligationMonth);
    return eligible;
  });
}

export function monthKeyToDate(monthKey: string) {
  return `${monthKey}-01`;
}

export function buildWaterPreviewFromFacts(
  unit: {
    id: string;
    unit_type_id: string;
    unit_type_code: UnitTypeCode;
    has_meter: boolean;
  },
  obligationMonth: string,
  financialFacts: BuildingMonthFinancialFacts,
): WaterChargePreviewBundle {
  const sourceReadingMonth = previousMonthKeyFromMonthKey(obligationMonth) ?? financialFacts.sourceReadingMonth;
  const sourceReadingMonthLabel = monthLabelFromKey(sourceReadingMonth);
  const billingMonthLabel = monthLabelFromKey(obligationMonth);
  const condoUnitRows = financialFacts.unitRows.filter((row) => row.unit_type_code === "condo");
  const eligibleUnitIds = condoUnitRows.map((row) => row.id);
  const readingsByUnit = new Map<string, Array<{ reading_end: number | null; consumption: number | null; created_at: string }>>();
  for (const row of financialFacts.waterReadings) {
    if (row.reading_date.slice(0, 7) !== sourceReadingMonth) continue;
    const rows = readingsByUnit.get(row.unit_id) ?? [];
    rows.push(row);
    readingsByUnit.set(row.unit_id, rows);
  }
  const completeness = {
    monthKey: sourceReadingMonth,
    monthLabel: sourceReadingMonthLabel,
    completedCount: eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length,
    totalExpectedCount: eligibleUnitIds.length,
    percentage: eligibleUnitIds.length > 0 ? (eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length / eligibleUnitIds.length) * 100 : 0,
    incompleteCount: Math.max(eligibleUnitIds.length - eligibleUnitIds.filter((unitId) => {
      const rows = readingsByUnit.get(unitId) ?? [];
      return rows.some((reading) => reading.reading_end !== null);
    }).length, 0),
  };

  return calculateWaterChargePreviewsForUnit({
    buildingId: "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810",
    supabase: {} as never,
    unit,
    unitTypeCode: unit.unit_type_code,
    commonWaterTypeId: financialFacts.commonWaterType?.id ?? "",
    completeness,
    sourceReadingMonth,
    sourceReadingMonthLabel,
    billingMonthLabel,
    eligibleUnitIds,
    readingsByUnit,
    bill: financialFacts.commonWaterBill,
  });
}

export function buildGasCalculationInputFromFacts(
  financialFacts: BuildingMonthFinancialFacts,
  obligationMonth: string,
): GasCalculationInput {
  return {
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
  };
}

export function buildFixedAssessmentMap(
  plan: { currency: string; monthly_operating_budget: string } | null,
  planYear: number,
  units: Array<{
    id: string;
    participation_percentage: number | null;
  }>,
) {
  const map = new Map<string, UnitFixedMonthlyAssessmentState>();
  for (const unit of units) {
    map.set(unit.id, getUnitFixedMonthlyAssessmentFromFacts({
      unitId: unit.id,
      planYear,
      unitParticipationPercentage: unit.participation_percentage,
      plan,
    }));
  }
  return map;
}

export function buildChargeMap(
  charges: ChargeRecord[],
  obligationMonth: string,
  unitIds: string[],
) {
  const map = new Map<string, { amount: string; lineItems: Array<{ chargeId: string; description: string; amount: string; effectiveFromMonth: string; effectiveToMonth: string | null; }> }>();
  for (const unitId of unitIds) {
    map.set(unitId, calculateUpcomingUnitChargesFromFacts(charges, unitId, obligationMonth));
  }
  return map;
}

export async function loadBuildingMonthFinancialFacts({
  buildingId,
  obligationMonth,
}: {
  buildingId: string;
  obligationMonth: string;
}): Promise<BuildingMonthFinancialFactsResult> {
  const supabase = await createClient();
  const planYear = Number(obligationMonth.slice(0, 4));
  const sourceReadingMonth = previousMonthKeyFromMonthKey(obligationMonth) ?? "2026-07";
  const rpc = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("tb810_get_building_month_financial_facts", {
    p_building_id: buildingId,
    p_plan_year: planYear,
    p_reading_month: monthKeyToDate(sourceReadingMonth),
  });
  if (rpc.error) return withRequestCount({ data: null, error: rpc.error.message }, 1);
  if (!rpc.data) return withRequestCount({ data: null, error: "Building month facts not found." }, 1);

  const payload = rpc.data as BuildingMonthFinancialFactsRpcPayload;
  const commonWaterBill = payload.commonWaterBill ?? null;
  if (!commonWaterBill) return withRequestCount({ data: null, error: "Common water bill not found." }, 1);

  return {
    data: {
      obligationMonth,
      sourceReadingMonth,
      planYear,
      plan: payload.plan ? { currency: String(payload.plan.currency), monthly_operating_budget: String(payload.plan.monthly_operating_budget) } : null,
      commonWaterType: payload.commonWaterType ?? null,
      commonWaterBill,
      unitRows: payload.unitRows ?? [],
      waterReadings: payload.waterReadings ?? [],
      gasBills: payload.gasBills ?? [],
      gasReadings: payload.gasReadings ?? [],
      charges: payload.charges ?? [],
    },
    error: null,
    requestCount: 1,
  };
}

export async function loadOwnerMonthResponsibility({
  ownerId,
  obligationMonth,
  buildingId,
}: {
  ownerId: string;
  obligationMonth: string;
  buildingId: string;
}): Promise<OwnerMonthResponsibilityResult> {
  const supabase = await createClient();
  const [ownerResult, ownershipsResult, ownerDirectChargesResult] = await Promise.all([
    supabase.from("tb810_owners").select("id, owner_reference, full_name, email, phone_number, notes, active, created_at, updated_at").eq("id", ownerId).maybeSingle(),
    supabase
      .from("tb810_ownerships")
      .select("id, owner_id, unit_id, start_date, end_date, notes, legacy_table, legacy_id, legacy_metadata, created_at, updated_at, tb810_owners!tb810_ownerships_owner_id_fkey(id, full_name, owner_reference, active), tb810_units!tb810_ownerships_unit_id_fkey(id, unit_number, unit_type_id, participation_percentage, has_meter, has_gas_service, tb810_unit_types!tb810_units_unit_type_id_fkey(id, code, name, sort_order))")
      .eq("owner_id", ownerId)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("tb810_charges")
      .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
      .eq("building_id", buildingId)
      .eq("owner_id", ownerId),
  ]);

  if (ownerResult.error) return { data: null, error: ownerResult.error.message, requestCount: 3 };
  if (ownershipsResult.error) return { data: null, error: ownershipsResult.error.message, requestCount: 3 };
  if (ownerDirectChargesResult.error) return { data: null, error: ownerDirectChargesResult.error.message, requestCount: 3 };
  if (!ownerResult.data) return { data: null, error: "Owner not found.", requestCount: 3 };

  const ownershipRows = (ownershipsResult.data ?? [])
    .map((row) => {
      const owner = (row as unknown as { tb810_owners?: { id: string; full_name: string; owner_reference: string; active: boolean } | null }).tb810_owners ?? null;
      const unit = (row as unknown as { tb810_units?: { id: string; unit_number: string; unit_type_id: string; participation_percentage: number | null; has_meter: boolean | null; has_gas_service: boolean | null; tb810_unit_types?: { id: string; code: UnitTypeCode; name: string; sort_order: number } | null } | null }).tb810_units ?? null;
      if (!owner || !unit) return null;
      return {
        ...(row as OwnershipRecord),
        owner,
        unit_number: unit.unit_number,
        unit_type_code: unit.tb810_unit_types?.code ?? "condo",
        unit_type_name: unit.tb810_unit_types?.name ?? "Unit",
        ownership_status: classifyOwnershipRow(row, obligationMonth),
        has_meter: Boolean(unit.has_meter),
        has_gas_service: Boolean(unit.has_gas_service),
        participation_percentage: unit.participation_percentage ?? null,
      };
    })
    .filter(Boolean) as OwnerMonthResponsibility["ownershipRows"];

  const responsibleUnits = ownershipRows
    .filter((row) => row.ownership_status === "current")
    .map((row) => ({
      unitId: row.unit_id,
      unitNumber: row.unit_number,
      unitTypeCode: row.unit_type_code,
      hasMeter: row.has_meter,
      hasGasService: row.has_gas_service,
      participationPercentage: row.participation_percentage,
    }));

  const lineItems = selectChargeRows((ownerDirectChargesResult.data ?? []) as ChargeRecord[], obligationMonth).map((row) => ({
    chargeId: row.id,
    description: row.description,
    amount: row.amount.toFixed(2),
    effectiveFromMonth: row.effective_from_month.slice(0, 7),
    effectiveToMonth: row.effective_to_month ? row.effective_to_month.slice(0, 7) : null,
  }));

  const amount = lineItems.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2);

  return {
    data: {
      owner: {
        ...ownerResult.data,
        unit_count: ownershipRows.length,
      },
      ownershipRows,
      responsibleUnits,
      ownerDirectCharges: {
        state: lineItems.length > 0 ? "available" : "blocked",
        amount,
        count: lineItems.length,
        reason: lineItems.length > 0 ? null : "No owner direct charges are available for this month.",
        lineItems,
      },
    },
    error: null,
    requestCount: 3,
  };
}
