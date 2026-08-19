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

type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

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

function monthLabelFromKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function monthKeyToDate(monthKey: string) {
  return `${monthKey}-01`;
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
  const sourceMonthDate = monthKeyToDate(sourceReadingMonth);

  const [planResult, unitsResult, utilityTypeResult] = await Promise.all([
    supabase.from("tb810_budget_plans").select("id, building_id, plan_year, currency, monthly_operating_budget, created_at, updated_at").eq("building_id", buildingId).eq("plan_year", planYear).maybeSingle(),
    supabase.from("tb810_units").select("id, unit_number, unit_type_id, participation_percentage, has_meter, has_gas_service, tb810_unit_types!tb810_units_unit_type_id_fkey(id, code, name, sort_order)").eq("building_id", buildingId).order("display_order", { ascending: true }).order("unit_number", { ascending: true }),
    supabase.from("tb810_utility_types").select("id, code, name").eq("code", "common_water").maybeSingle(),
  ]);

  if (planResult.error) return withRequestCount({ data: null, error: planResult.error.message }, 9);
  if (unitsResult.error) return withRequestCount({ data: null, error: unitsResult.error.message }, 9);
  if (utilityTypeResult.error) return withRequestCount({ data: null, error: utilityTypeResult.error.message }, 9);
  if (!utilityTypeResult.data) return withRequestCount({ data: null, error: "Common water utility type not found." }, 9);

  const [billingPeriodResult, waterReadingsResult, gasBillsResult, gasReadingsResult, chargesResult] = await Promise.all([
    supabase.from("tb810_billing_periods").select("id, status, period_year, period_month").eq("building_id", buildingId).eq("period_year", Number(sourceReadingMonth.slice(0, 4))).eq("period_month", Number(sourceReadingMonth.slice(5, 7))).maybeSingle(),
    supabase.from("tb810_meter_readings").select("unit_id, reading_end, consumption, reading_date, created_at").eq("building_id", buildingId).eq("utility_type_id", utilityTypeResult.data.id).eq("reading_month", sourceMonthDate),
    supabase.from("tb810_gas_bills").select("id, amount, processed_at, invoice_date").eq("building_id", buildingId).order("invoice_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("tb810_gas_readings").select("unit_id, reading_month, current_reading, previous_reading, consumption").eq("building_id", buildingId).eq("reading_month", sourceMonthDate),
    supabase.from("tb810_charges").select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at").eq("building_id", buildingId),
  ]);

  if (billingPeriodResult.error) return withRequestCount({ data: null, error: billingPeriodResult.error.message }, 9);
  if (waterReadingsResult.error) return withRequestCount({ data: null, error: waterReadingsResult.error.message }, 9);
  if (gasBillsResult.error) return withRequestCount({ data: null, error: gasBillsResult.error.message }, 9);
  if (gasReadingsResult.error) return withRequestCount({ data: null, error: gasReadingsResult.error.message }, 9);
  if (chargesResult.error) return withRequestCount({ data: null, error: chargesResult.error.message }, 9);

  const commonWaterBill: QueryResult<CommonWaterBill> = billingPeriodResult.data
    ? await supabase
        .from("tb810_utility_bills")
        .select("id, building_id, utility_type_id, billing_period_id, supplier_id, bill_date, amount, description, attachment_document_id, status, notes, previous_reading, current_reading, total_consumption, unit_cost, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
        .eq("building_id", buildingId)
        .eq("billing_period_id", billingPeriodResult.data.id)
        .maybeSingle()
        .then(({ data, error }) =>
          error
            ? { error: error.message, data: null }
            : {
                error: null,
                data: data ? ({ ...data } as unknown as CommonWaterBill) : null,
              },
        )
    : { error: null, data: null };

  if (!commonWaterBill.data) return withRequestCount({ data: null, error: "Common water bill not found." }, 9);
  const resolvedCommonWaterBill = commonWaterBill.data;

  if (commonWaterBill.error) return withRequestCount({ data: null, error: commonWaterBill.error }, 9);

  const unitRows = (unitsResult.data ?? []).map((row) => {
    const unitType = (row as unknown as { tb810_unit_types?: { id: string; code: UnitTypeCode; name: string } | null }).tb810_unit_types ?? null;
    return {
      id: row.id,
      unit_number: row.unit_number,
      unit_type_id: row.unit_type_id,
      unit_type_code: unitType?.code ?? "condo",
      has_meter: Boolean(row.has_meter),
      has_gas_service: Boolean(row.has_gas_service),
      participation_percentage: row.participation_percentage ?? null,
    };
  });

  return {
      data: {
        obligationMonth,
        sourceReadingMonth,
        planYear,
        plan: planResult.data
          ? { currency: planResult.data.currency, monthly_operating_budget: String(planResult.data.monthly_operating_budget) }
          : null,
        commonWaterType: utilityTypeResult.data,
        commonWaterBill: resolvedCommonWaterBill,
        unitRows,
        waterReadings: (waterReadingsResult.data ?? []).map((row) => ({
          unit_id: row.unit_id,
          reading_end: row.reading_end,
          consumption: row.consumption,
          reading_date: row.reading_date,
          created_at: row.created_at,
        })),
        gasBills: (gasBillsResult.data ?? []).map((row) => ({ id: row.id, amount: row.amount, processed_at: row.processed_at, invoice_date: row.invoice_date })),
        gasReadings: (gasReadingsResult.data ?? []).map((row) => ({
          unit_id: row.unit_id,
          reading_month: row.reading_month,
          current_reading: row.current_reading,
          previous_reading: row.previous_reading,
          consumption: row.consumption,
        })),
        charges: (chargesResult.data ?? []) as ChargeRecord[],
    },
    error: null,
    requestCount: 9,
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
