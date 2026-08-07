import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding } from "@/server/units";
import { getCurrentReadingMonthCompleteness } from "@/server/water/unit-meter-readings";

import type {
  CommonWaterBillInput,
  CommonWaterBillUpdateInput,
} from "./validation";
import { commonWaterBillInputSchema, commonWaterBillUpdateInputSchema } from "./validation";
import type {
  WaterBillRecord,
  WaterBillSummary,
} from "./types";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

type DecimalParts = {
  integer: bigint;
  scale: bigint;
};

type MeterReadingLookupQuery = {
  select(columns: string): MeterReadingLookupQuery;
  eq(column: string, value: string): MeterReadingLookupQuery;
  order(
    column: string,
    options?: {
      ascending?: boolean;
    },
  ): MeterReadingLookupQuery;
  limit(count: number): Promise<
    QueryResult<
      Array<{
        consumption: number | null;
      }>
    >
  >;
};

export type August2026MeteredWaterChargeState =
  | {
      status: "available";
      data: {
        amount: string;
        periodRateText: string;
        unitConsumptionText: string;
        sourceReadingMonthLabel: string;
        billingMonthLabel: string;
      };
    }
  | {
      status: "not-applicable" | "unavailable";
      message: string;
    };

export type CommonWaterChargePreviewState =
  | {
      status: "available";
      data: {
        billingMonthLabel: string;
        sourceReadingMonthLabel: string;
        completedCount: number;
        expectedCount: number;
        supplierAmount: string;
        summedMeteredCharges: string;
        commonWaterPool: string;
        unitCommonWaterCharge: string;
      };
    }
  | {
      status: "not-applicable" | "unavailable";
      message: string;
    };

export type SedapalBillCycleState =
  | {
      status: "complete";
    }
  | {
      status: "in-progress";
    }
  | {
      status: "missing" | "unavailable";
      message: string;
    };

type August2026UnitWaterCycleContext = {
  buildingId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  unit: {
    id: string;
    unit_type_id: string;
    has_meter: boolean;
  };
  unitTypeCode: string;
  commonWaterTypeId: string;
  completeness: NonNullable<Awaited<ReturnType<typeof getCurrentReadingMonthCompleteness>>["data"]>;
  sourceReadingMonth: string;
  sourceReadingMonthLabel: string;
  billingMonthLabel: string;
  eligibleUnitIds: string[];
  readingsByUnit: Map<string, Array<{ reading_end: number | null; consumption: number | null; created_at: string }>>;
  bill: Awaited<ReturnType<typeof getCommonWaterBillForCycleMonth>>["data"];
};

const WATER_BILL_SELECT =
  "id, building_id, utility_type_id, billing_period_id, supplier_id, bill_date, amount, description, attachment_document_id, status, notes, previous_reading, current_reading, total_consumption, unit_cost, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at" as const;
const METER_READING_SELECT =
  "id, building_id, unit_id, utility_type_id, reading_date, reading_start, reading_end, consumption, status, created_at" as const;
const UNIT_SELECT = "id, building_id, unit_type_id, has_meter" as const;
const UNIT_TYPE_SELECT = "id, code, name" as const;

const BILLING_PERIOD_SELECT = "id, status, period_year, period_month" as const;

function toBillRecord(row: WaterBillRecord): WaterBillRecord {
  return row;
}

function parseDecimal(value: string): DecimalParts | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = fraction.replace(/0+$/, "");
  return {
    integer: BigInt(`${whole}${normalized || ""}`),
    scale: normalized.length > 0 ? BigInt(10 ** normalized.length) : BigInt(1),
  };
}

function formatDecimal(value: bigint, scaleDigits: number) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const scale = BigInt(10 ** scaleDigits);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(scaleDigits, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function parseMoneyCents(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = parseDecimal(String(value));
  if (!parsed) return null;
  return (parsed.integer * BigInt(100)) / parsed.scale;
}

function parseMilliUnits(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = parseDecimal(String(value));
  if (!parsed) return null;
  return (parsed.integer * BigInt(1000)) / parsed.scale;
}

function formatMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function getNextMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function monthKeyToDate(monthKey: string) {
  return `${monthKey}-01`;
}

function roundToNearestInteger(value: bigint, divisor: bigint) {
  return (value + divisor / BigInt(2)) / divisor;
}

async function getUtilityTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: "water" | "common_water",
) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", code)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) {
    return {
      data: null,
      error: code === "water" ? "Water utility type is missing." : "Common Water utility type is missing.",
    };
  }

  return { data, error: null };
}

async function getCommonWaterUtilityTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", "common_water")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  return { data, error: null };
}

async function getBillingPeriodForBillDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  billDate: string,
) {
  const parsed = new Date(`${billDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { data: null, error: "Bill date is invalid." };
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;

  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("building_id", buildingId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getBillingPeriodStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billingPeriodId: string | null,
) {
  if (!billingPeriodId) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("id", billingPeriodId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getCommonWaterBillForCycleMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  sourceMonthKey: string,
) {
  const sourceMonth = new Date(`${sourceMonthKey}-01T00:00:00Z`);
  if (Number.isNaN(sourceMonth.getTime())) {
    return { data: null, error: "Reading month is invalid." };
  }

  const billingMonth = new Date(Date.UTC(sourceMonth.getUTCFullYear(), sourceMonth.getUTCMonth() - 1, 1));
  const { data: billingPeriod, error: billingPeriodError } = await supabase
    .from("tb810_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("building_id", buildingId)
    .eq("period_year", billingMonth.getUTCFullYear())
    .eq("period_month", billingMonth.getUTCMonth() + 1)
    .maybeSingle();

  if (billingPeriodError) {
    return { data: null, error: billingPeriodError.message };
  }
  if (!billingPeriod) {
    return { data: null, error: "Sedapal water bill has not been entered yet." };
  }

  const { data: bills, error } = await supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingId)
    .eq("billing_period_id", billingPeriod.id)
    .eq("utility_type_id", utilityTypeId)
    .limit(2);

  if (error) {
    return { data: null, error: error.message };
  }
  if ((bills ?? []).length === 0) {
    return { data: null, error: "Sedapal water bill has not been entered yet." };
  }
  if ((bills ?? []).length > 1) {
    return { data: null, error: "Sedapal water bill is ambiguous." };
  }

  return { data: bills[0] ?? null, error: null };
}

async function getAugust2026UnitWaterCycleContext(
  unitId: string,
): Promise<
  | { data: August2026UnitWaterCycleContext; error: null }
  | { data: null; error: string }
> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) {
    return { data: null, error: "Current building not found." };
  }

  const supabase = await createClient();
  const [unitResult, commonWaterTypeResult, completenessResult] = await Promise.all([
    supabase
      .from("tb810_units")
      .select(UNIT_SELECT)
      .eq("building_id", buildingResult.data.id)
      .eq("id", unitId)
      .maybeSingle(),
    getUtilityTypeId(supabase, "common_water"),
    getCurrentReadingMonthCompleteness("2026-07"),
  ]);

  if (unitResult.error) return { data: null, error: unitResult.error.message };
  if (commonWaterTypeResult.error) return { data: null, error: commonWaterTypeResult.error };
  if (completenessResult.error) return { data: null, error: completenessResult.error };
  if (!unitResult.data) return { data: null, error: "Unit not found." };
  if (!commonWaterTypeResult.data) {
    return { data: null, error: "Water lookup data is incomplete." };
  }
  if (!completenessResult.data) {
    return { data: null, error: "Water lookup data is incomplete." };
  }

  const { data: unitType, error: unitTypeError } = await supabase
    .from("tb810_unit_types")
    .select(UNIT_TYPE_SELECT)
    .eq("id", unitResult.data.unit_type_id)
    .maybeSingle();
  if (unitTypeError) return { data: null, error: unitTypeError.message };
  if (!unitType) return { data: null, error: "Unit type is missing." };
  if (unitType.code !== "condo") {
    return { data: null, error: "Common Water is not applicable for this Unit." };
  }

  const [unitRowsResult, billResult, readingsResult] = await Promise.all([
    supabase
      .from("tb810_units")
      .select("id")
      .eq("building_id", buildingResult.data.id)
      .eq("unit_type_id", unitType.id),
    getCommonWaterBillForCycleMonth(
      supabase,
      buildingResult.data.id,
      commonWaterTypeResult.data.id,
      completenessResult.data.monthKey,
    ),
    supabase
      .from("tb810_meter_readings")
      .select("unit_id, reading_end, consumption, reading_date, created_at")
      .eq("building_id", buildingResult.data.id)
      .eq("utility_type_id", commonWaterTypeResult.data.id)
      .eq("reading_month", monthKeyToDate(completenessResult.data.monthKey)),
  ]);

  if (unitRowsResult.error) return { data: null, error: unitRowsResult.error.message };
  if (billResult.error) return { data: null, error: billResult.error };
  if (readingsResult.error) return { data: null, error: readingsResult.error.message };

  const eligibleUnitIds = (unitRowsResult.data ?? []).map((row) => row.id);
  const readingsByUnit = new Map<string, Array<{ reading_end: number | null; consumption: number | null; created_at: string }>>();
  for (const row of readingsResult.data ?? []) {
    const rows = readingsByUnit.get(row.unit_id) ?? [];
    rows.push(row);
    readingsByUnit.set(row.unit_id, rows);
  }

  return {
    data: {
      buildingId: buildingResult.data.id,
      supabase,
      unit: {
        id: unitResult.data.id,
        unit_type_id: unitResult.data.unit_type_id,
        has_meter: Boolean(unitResult.data.has_meter),
      },
      unitTypeCode: unitType.code,
      commonWaterTypeId: commonWaterTypeResult.data.id,
      completeness: completenessResult.data,
      sourceReadingMonth: completenessResult.data.monthKey,
      sourceReadingMonthLabel: completenessResult.data.monthLabel,
      billingMonthLabel: getNextMonthLabel(completenessResult.data.monthKey) ?? "August 2026",
      eligibleUnitIds,
      readingsByUnit,
      bill: billResult.data,
    },
    error: null,
  };
}

async function getSedapalBillCycleStateForCurrentReadingMonth(): Promise<SedapalBillCycleState> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { status: "unavailable", message: buildingResult.error };
  if (!buildingResult.data) {
    return { status: "unavailable", message: "Current building not found." };
  }

  const supabase = await createClient();
  const [{ data: utilityType, error: utilityTypeError }, completenessResult] = await Promise.all([
    getUtilityTypeId(supabase, "common_water"),
    getCurrentReadingMonthCompleteness(),
  ]);

  if (utilityTypeError) return { status: "unavailable", message: utilityTypeError };
  if (!utilityType) return { status: "unavailable", message: "Water lookup data is incomplete." };
  if (completenessResult.error) return { status: "unavailable", message: completenessResult.error };
  if (!completenessResult.data) {
    return { status: "unavailable", message: "Water lookup data is incomplete." };
  }

  const billResult = await getCommonWaterBillForCycleMonth(
    supabase,
    buildingResult.data.id,
    utilityType.id,
    completenessResult.data.monthKey,
  );

  if (billResult.error) {
    if (billResult.error === "Sedapal water bill has not been entered yet.") {
      return { status: "missing", message: billResult.error };
    }
    if (billResult.error === "Sedapal water bill is ambiguous.") {
      return { status: "unavailable", message: billResult.error };
    }
    return { status: "unavailable", message: billResult.error };
  }

  const bill = billResult.data;
  if (!bill) {
    return { status: "missing", message: "Sedapal water bill has not been entered yet." };
  }

  const amountCents = parseMoneyCents(bill.amount);
  const totalConsumptionMilli = parseMilliUnits(bill.total_consumption);
  if (amountCents === null || totalConsumptionMilli === null || totalConsumptionMilli <= BigInt(0)) {
    return { status: "in-progress" };
  }

  return { status: "complete" };
}

async function getLatestCommonWaterBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  beforeBillDate?: string,
) {
  let request = supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingId)
    .eq("utility_type_id", utilityTypeId);

  if (beforeBillDate) {
    request = request.lt("bill_date", beforeBillDate);
  }

  const { data, error } = await request
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getCommonWaterChargeForUnitPreview(
  unitId: string,
): Promise<CommonWaterChargePreviewState> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { status: "unavailable", message: buildingResult.error };
  if (!buildingResult.data) {
    return { status: "unavailable", message: "Current building not found." };
  }

  const supabase = await createClient();
  const [
    { data: commonWaterType, error: commonWaterTypeError },
    completenessResult,
  ] = await Promise.all([
    getUtilityTypeId(supabase, "common_water"),
    getCurrentReadingMonthCompleteness(),
  ]);

  if (commonWaterTypeError) return { status: "unavailable", message: commonWaterTypeError };
  if (!commonWaterType) {
    return { status: "unavailable", message: "Water lookup data is incomplete." };
  }
  if (completenessResult.error) {
    return { status: "unavailable", message: completenessResult.error };
  }
  if (!completenessResult.data) {
    return { status: "unavailable", message: "Water lookup data is incomplete." };
  }

  const unit = await supabase
    .from("tb810_units")
    .select("id, unit_type_id, has_meter")
    .eq("building_id", buildingResult.data.id)
    .eq("id", unitId)
    .maybeSingle();

  if (unit.error) return { status: "unavailable", message: unit.error.message };
  if (!unit.data) return { status: "unavailable", message: "Unit not found." };

  const unitType = await supabase
    .from("tb810_unit_types")
    .select("id, code, name")
    .eq("id", unit.data.unit_type_id)
    .maybeSingle();

  if (unitType.error) return { status: "unavailable", message: unitType.error.message };
  if (!unitType.data) return { status: "unavailable", message: "Unit type is missing." };

  if (unitType.data.code !== "condo") {
    return { status: "not-applicable", message: "Common Water is not applicable for this Unit." };
  }

  if (completenessResult.data.totalExpectedCount === 0) {
    return { status: "unavailable", message: "No expected residential units are available." };
  }

  if (completenessResult.data.completedCount !== completenessResult.data.totalExpectedCount) {
    return { status: "unavailable", message: "Cannot be calculated because unit meter readings are incomplete." };
  }

  const sourceReadingMonthLabel = completenessResult.data.monthLabel;
  const billingMonthLabel = getNextMonthLabel(completenessResult.data.monthKey);
  if (!billingMonthLabel) {
    return { status: "unavailable", message: "Water lookup data is incomplete." };
  }

  const unitRows = await supabase
    .from("tb810_units")
    .select("id")
    .eq("building_id", buildingResult.data.id)
    .eq("unit_type_id", unitType.data.id);
  if (unitRows.error) return { status: "unavailable", message: unitRows.error.message };
  const eligibleUnitIds = (unitRows.data ?? []).map((row) => row.id);
  if (eligibleUnitIds.length === 0) {
    return { status: "unavailable", message: "No eligible residential units are available." };
  }

  const meterQuery = supabase
    .from("tb810_meter_readings")
    .select("unit_id, reading_end, consumption, reading_date, created_at")
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", commonWaterType.id)
    .eq("reading_month", monthKeyToDate(completenessResult.data.monthKey));

  const { data: readings, error: readingError } = await meterQuery;
  if (readingError) return { status: "unavailable", message: readingError.message };

  const readingsByUnit = new Map<string, Array<{ reading_end: number | null; consumption: number | null; created_at: string }>>();
  for (const row of readings ?? []) {
    const rows = readingsByUnit.get(row.unit_id) ?? [];
    rows.push(row);
    readingsByUnit.set(row.unit_id, rows);
  }

  const unitConsumptionById = new Map<string, number>();
  for (const unitId of eligibleUnitIds) {
    const rows = readingsByUnit.get(unitId) ?? [];
    if (rows.length === 0) {
      return { status: "unavailable", message: "Cannot be calculated because unit meter readings are incomplete." };
    }
    if (rows.length > 1) {
      return { status: "unavailable", message: "July 2026 meter reading is ambiguous." };
    }
    const reading = rows[0];
    if (reading.consumption === null) {
      return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
    }
    unitConsumptionById.set(unitId, Number(reading.consumption));
  }

  const billResult = await getCommonWaterBillForCycleMonth(
    supabase,
    buildingResult.data.id,
    commonWaterType.id,
    completenessResult.data.monthKey,
  );
  if (billResult.error) return { status: "unavailable", message: billResult.error };
  const bill = billResult.data;
  if (!bill) {
    return { status: "unavailable", message: "Sedapal water bill has not been entered yet." };
  }

  const amountCents = parseMoneyCents(bill.amount);
  const totalConsumptionMilli = parseMilliUnits(bill.total_consumption);
  if (amountCents === null) {
    return { status: "unavailable", message: "Sedapal bill amount is invalid." };
  }
  if (totalConsumptionMilli === null || totalConsumptionMilli <= BigInt(0)) {
    return { status: "unavailable", message: "Sedapal bill total consumption is invalid." };
  }

  let summedMeteredChargeCents = BigInt(0);
  for (const unitId of eligibleUnitIds) {
    const consumptionMilli = parseMilliUnits(unitConsumptionById.get(unitId) ?? null);
    if (consumptionMilli === null) {
      return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
    }
    const chargeCents =
      (amountCents * consumptionMilli + totalConsumptionMilli / BigInt(2)) / totalConsumptionMilli;
    summedMeteredChargeCents += chargeCents;
  }

  if (summedMeteredChargeCents > amountCents) {
    return { status: "unavailable", message: "Common Water pool would be negative." };
  }

  const commonWaterPoolCents = amountCents - summedMeteredChargeCents;
  const unitCommonWaterChargeCents = roundToNearestInteger(commonWaterPoolCents, BigInt(64));

  return {
    status: "available",
    data: {
      billingMonthLabel,
      sourceReadingMonthLabel,
      completedCount: completenessResult.data.completedCount,
      expectedCount: completenessResult.data.totalExpectedCount,
      supplierAmount: formatDecimal(amountCents, 2),
      summedMeteredCharges: formatDecimal(summedMeteredChargeCents, 2),
      commonWaterPool: formatDecimal(commonWaterPoolCents, 2),
      unitCommonWaterCharge: formatDecimal(unitCommonWaterChargeCents, 2),
    },
  };
}

function isBillEditable(billingPeriodStatus: string | null | undefined) {
  return billingPeriodStatus !== "closed";
}

async function getCommonWaterReadingContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  billDate: string,
) {
  const latestPrior = await getLatestCommonWaterBill(
    supabase,
    buildingId,
    utilityTypeId,
    billDate,
  );

  if (latestPrior.error) {
    return { data: null, error: latestPrior.error };
  }

  if (latestPrior.data) {
    return {
      data: {
        hasPriorBill: true,
        previousReading: latestPrior.data.current_reading,
      },
      error: null,
    };
  }

  const firstBill = await getLatestCommonWaterBill(supabase, buildingId, utilityTypeId);
  if (firstBill.error) {
    return { data: null, error: firstBill.error };
  }

  return {
    data: {
      hasPriorBill: false,
      previousReading: firstBill.data?.previous_reading ?? null,
    },
    error: null,
  };
}

export async function listCommonWaterBills(): Promise<
  QueryResult<WaterBillSummary[]>
> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);

  if (utilityTypeError) {
    return { data: [], error: utilityTypeError };
  }

  if (!utilityType) {
    return { data: [], error: "Common Water utility type is missing." };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = data ?? [];
  const billingPeriodIds = [
    ...new Set(rows.map((row) => row.billing_period_id).filter(Boolean)),
  ] as string[];
  const billingPeriodById = new Map<string, { status: string }>();

  for (const billingPeriodId of billingPeriodIds) {
    const billingPeriod = await getBillingPeriodStatus(supabase, billingPeriodId);
    if (billingPeriod.error) {
      return { data: [], error: billingPeriod.error };
    }

    if (billingPeriod.data) {
      billingPeriodById.set(billingPeriodId, {
        status: billingPeriod.data.status,
      });
    }
  }

  return {
    data: rows.map((row) => {
      const billingPeriod = billingPeriodById.get(row.billing_period_id ?? "");
      return {
        ...toBillRecord(row),
        utility_type_name: utilityType.name,
        billing_period_status: billingPeriod?.status ?? null,
        is_editable: isBillEditable(billingPeriod?.status),
      };
    }),
    error: null,
  };
}

export async function getWaterBillById(
  billId: string,
): Promise<QueryResult<WaterBillSummary | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);

  if (utilityTypeError) {
    return { data: null, error: utilityTypeError };
  }

  if (!utilityType) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .eq("id", billId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: null };
  }

  const billingPeriod = await getBillingPeriodStatus(supabase, data.billing_period_id);
  if (billingPeriod.error) {
    return { data: null, error: billingPeriod.error };
  }

  return {
    data: {
      ...toBillRecord(data),
      utility_type_name: utilityType.name,
      billing_period_status: billingPeriod.data?.status ?? null,
      is_editable: isBillEditable(billingPeriod.data?.status),
    },
    error: null,
  };
}

function parseReading(value: string) {
  return Number(value);
}

function parseMoney(value: string) {
  return Number(value);
}

export async function createCommonWaterBill(
  input: CommonWaterBillInput,
): Promise<QueryResult<WaterBillRecord>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) {
    return { data: null as never, error: buildingResult.error };
  }

  if (!buildingResult.data) {
    return { data: null as never, error: "Current building not found." };
  }

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);

  if (utilityTypeError) {
    return { data: null as never, error: utilityTypeError };
  }

  if (!utilityType) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const parsed = commonWaterBillInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.",
    };
  }

  const payload = parsed.data;
  const currentReading = parseReading(payload.current_reading);
  const amount = parseMoney(payload.amount);
  const readingContext = await getCommonWaterReadingContext(
    supabase,
    buildingResult.data.id,
    utilityType.id,
    payload.bill_date,
  );

  if (readingContext.error) {
    return { data: null as never, error: readingContext.error };
  }

  const previousReading = readingContext.data?.hasPriorBill
    ? readingContext.data.previousReading ?? 0
    : parseReading(payload.previous_reading);
  const totalConsumption = currentReading - previousReading;
  const unitCost = totalConsumption === 0 ? 0 : Number((amount / totalConsumption).toFixed(4));
  const billingPeriod = await getBillingPeriodForBillDate(
    supabase,
    buildingResult.data.id,
    payload.bill_date,
  );

  if (billingPeriod.error) {
    return { data: null as never, error: billingPeriod.error };
  }

  if (!readingContext.data?.hasPriorBill && previousReading < 0) {
    return { data: null as never, error: "Opening reading must be zero or greater." };
  }

  if (currentReading < previousReading) {
    return {
      data: null as never,
      error: "Current reading must be greater than or equal to previous reading.",
    };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .insert({
      building_id: buildingResult.data.id,
      utility_type_id: utilityType.id,
      billing_period_id: billingPeriod.data?.id ?? null,
      bill_date: payload.bill_date,
      amount,
      description: payload.description || "Sedapal common water invoice",
      notes: payload.notes || null,
      previous_reading: previousReading,
      current_reading: currentReading,
      total_consumption: totalConsumption,
      unit_cost: unitCost,
      status: "received",
      legacy_table: "tb810_common_water_ledger",
      legacy_id: `${buildingResult.data.id}:${payload.bill_date}`,
      legacy_metadata: {
        slice: "common_water_ledger",
        utility_type_code: "common_water",
        source: "giuiana_monthly_workflow",
      },
    })
    .select(WATER_BILL_SELECT)
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export async function getLatestPreviousCommonWaterReading() {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);
  if (utilityTypeError) return { data: null, error: utilityTypeError };
  if (!utilityType) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  const latest = await getLatestCommonWaterBill(
    supabase,
    buildingResult.data.id,
    utilityType.id,
  );
  if (latest.error) return { data: null, error: latest.error };

  return {
    data: latest.data
      ? {
          hasPriorBill: true,
          previousReading: latest.data.current_reading,
        }
      : {
          hasPriorBill: false,
          previousReading: null,
        },
    error: null,
  };
}

export async function getCommonWaterReadingDefaults(billDate?: string) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);
  if (utilityTypeError) return { data: null, error: utilityTypeError };
  if (!utilityType) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  const latest = billDate
    ? await getLatestCommonWaterBill(
        supabase,
        buildingResult.data.id,
        utilityType.id,
        billDate,
      )
    : await getLatestCommonWaterBill(
        supabase,
        buildingResult.data.id,
        utilityType.id,
      );

  if (latest.error) return { data: null, error: latest.error };

  return {
    data: {
      hasPriorBill: Boolean(latest.data),
      previousReading: latest.data?.current_reading ?? null,
    },
    error: null,
  };
}

export async function updateCommonWaterBill(
  billId: string,
  input: CommonWaterBillUpdateInput,
): Promise<QueryResult<WaterBillRecord>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) {
    return { data: null as never, error: "Current building not found." };
  }

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);
  if (utilityTypeError) return { data: null as never, error: utilityTypeError };
  if (!utilityType) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const parsed = commonWaterBillUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.",
    };
  }

  const existing = await getWaterBillById(billId);
  if (existing.error) return { data: null as never, error: existing.error };
  if (!existing.data) return { data: null as never, error: "Common water bill not found." };
  if (!existing.data.is_editable) {
    return { data: null as never, error: "This common water bill is locked." };
  }

  const payload = parsed.data;
  const currentReading = parseReading(payload.current_reading);
  const amount = parseMoney(payload.amount);

  const billingPeriod = await getBillingPeriodForBillDate(
    supabase,
    buildingResult.data.id,
    payload.bill_date,
  );
  if (billingPeriod.error) return { data: null as never, error: billingPeriod.error };

  const readingContext = await getCommonWaterReadingContext(
    supabase,
    buildingResult.data.id,
    utilityType.id,
    payload.bill_date,
  );
  if (readingContext.error) {
    return { data: null as never, error: readingContext.error };
  }

  const allowPreviousReadingEdit = !readingContext.data?.hasPriorBill;
  const previousReading = allowPreviousReadingEdit
    ? parseReading(payload.previous_reading ?? "")
    : existing.data.previous_reading;

  if (allowPreviousReadingEdit && payload.previous_reading === undefined) {
    return { data: null as never, error: "Opening reading is required." };
  }

  if (!allowPreviousReadingEdit && payload.previous_reading !== undefined) {
    return { data: null as never, error: "Previous reading is read-only." };
  }

  if (currentReading < previousReading) {
    return {
      data: null as never,
      error: "Current reading must be greater than or equal to previous reading.",
    };
  }

  const totalConsumption = currentReading - previousReading;
  const unitCost = totalConsumption === 0 ? 0 : Number((amount / totalConsumption).toFixed(4));

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .update({
      bill_date: payload.bill_date,
      billing_period_id: billingPeriod.data?.id ?? null,
      amount,
      description: payload.description || null,
      notes: payload.notes || null,
      current_reading: currentReading,
      total_consumption: totalConsumption,
      unit_cost: unitCost,
    })
    .eq("id", billId)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .select(WATER_BILL_SELECT)
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export async function getAugust2026MeteredWaterChargeForUnit(
  unitId: string,
): Promise<August2026MeteredWaterChargeState> {
  const contextResult = await getAugust2026UnitWaterCycleContext(unitId);
  if (contextResult.error) return { status: "unavailable", message: contextResult.error };
  const context = contextResult.data;
  if (!context) return { status: "unavailable", message: "Water lookup data is incomplete." };
  if (context.unitTypeCode !== "condo" || !context.unit.has_meter) {
    return { status: "not-applicable", message: "Metered water is not applicable for this Unit." };
  }
  const readings = context.readingsByUnit.get(unitId) ?? [];
  if (readings.length === 0) {
    return { status: "unavailable", message: "No July 2026 meter reading recorded." };
  }
  if (readings.length > 1) {
    return { status: "unavailable", message: "July 2026 meter reading is ambiguous." };
  }

  const reading = readings[0] ?? null;
  if (!reading) {
    return { status: "unavailable", message: "No July 2026 meter reading recorded." };
  }
  if (reading.consumption === null) {
    return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
  }

  const bill = context.bill;
  if (!bill) {
    return { status: "unavailable", message: "Sedapal water bill has not been entered yet." };
  }

  const amountCents = parseMoneyCents(bill.amount);
  const unitConsumptionMilli = parseMilliUnits(reading.consumption);
  const masterConsumptionMilli = parseMilliUnits(bill.total_consumption);

  if (amountCents === null || unitConsumptionMilli === null) {
    return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
  }
  if (masterConsumptionMilli === null || masterConsumptionMilli <= BigInt(0)) {
    return { status: "unavailable", message: "July 2026 water rate cannot be calculated." };
  }

  const chargeCents =
    (amountCents * unitConsumptionMilli + masterConsumptionMilli / BigInt(2)) /
    masterConsumptionMilli;
  const rateMicros =
    (amountCents * BigInt(1000000) + masterConsumptionMilli / BigInt(2)) /
    masterConsumptionMilli;

  return {
    status: "available",
    data: {
      amount: formatDecimal(chargeCents, 2),
      periodRateText: formatDecimal(rateMicros, 6),
      unitConsumptionText: formatDecimal(unitConsumptionMilli, 3),
      sourceReadingMonthLabel: context.sourceReadingMonthLabel,
      billingMonthLabel: context.billingMonthLabel,
    },
  };
}

export async function getCommonWaterChargePreviewForUnit(
  unitId: string,
): Promise<CommonWaterChargePreviewState> {
  const contextResult = await getAugust2026UnitWaterCycleContext(unitId);
  if (contextResult.error) return { status: "unavailable", message: contextResult.error };
  const context = contextResult.data;
  if (!context) return { status: "unavailable", message: "Water lookup data is incomplete." };

  if (context.unitTypeCode !== "condo") {
    return { status: "not-applicable", message: "Common Water is not applicable for this Unit." };
  }

  if (context.completeness.totalExpectedCount === 0) {
    return { status: "unavailable", message: "No expected residential units are available." };
  }

  if (context.completeness.completedCount !== context.completeness.totalExpectedCount) {
    return { status: "unavailable", message: "Cannot be calculated because unit meter readings are incomplete." };
  }

  const eligibleUnitIds = context.eligibleUnitIds;
  if (eligibleUnitIds.length === 0) {
    return { status: "unavailable", message: "No eligible residential units are available." };
  }

  const bill = context.bill;
  if (!bill) {
    return { status: "unavailable", message: "Sedapal water bill has not been entered yet." };
  }

  const amountCents = parseMoneyCents(bill.amount);
  const totalConsumptionMilli = parseMilliUnits(bill.total_consumption);
  if (amountCents === null) {
    return { status: "unavailable", message: "Sedapal bill amount is invalid." };
  }
  if (totalConsumptionMilli === null || totalConsumptionMilli <= BigInt(0)) {
    return { status: "unavailable", message: "Sedapal bill total consumption is invalid." };
  }

  let summedMeteredChargeCents = BigInt(0);
  for (const unitId of eligibleUnitIds) {
    const rows = context.readingsByUnit.get(unitId) ?? [];
    if (rows.length === 0) {
      return { status: "unavailable", message: "Cannot be calculated because unit meter readings are incomplete." };
    }
    if (rows.length > 1) {
      return { status: "unavailable", message: "July 2026 meter reading is ambiguous." };
    }
    const consumptionMilli = parseMilliUnits(rows[0].consumption);
    if (consumptionMilli === null) {
      return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
    }
    const chargeCents =
      (amountCents * consumptionMilli + totalConsumptionMilli / BigInt(2)) / totalConsumptionMilli;
    summedMeteredChargeCents += chargeCents;
  }

  if (summedMeteredChargeCents > amountCents) {
    return { status: "unavailable", message: "Common Water pool would be negative." };
  }

  const commonWaterPoolCents = amountCents - summedMeteredChargeCents;
  const unitCommonWaterChargeCents = roundToNearestInteger(commonWaterPoolCents, BigInt(64));

  return {
    status: "available",
    data: {
      billingMonthLabel: context.billingMonthLabel,
      sourceReadingMonthLabel: context.sourceReadingMonthLabel,
      completedCount: context.completeness.completedCount,
      expectedCount: context.completeness.totalExpectedCount,
      supplierAmount: formatDecimal(amountCents, 2),
      summedMeteredCharges: formatDecimal(summedMeteredChargeCents, 2),
      commonWaterPool: formatDecimal(commonWaterPoolCents, 2),
      unitCommonWaterCharge: formatDecimal(unitCommonWaterChargeCents, 2),
    },
  };
}

export async function getAugust2026WaterChargePreviewsForUnit(unitId: string): Promise<{
  meteredWater: August2026MeteredWaterChargeState;
  commonWater: CommonWaterChargePreviewState;
}> {
  const contextResult = await getAugust2026UnitWaterCycleContext(unitId);
  if (contextResult.error || !contextResult.data) {
    const message = contextResult.error ?? "Water lookup data is incomplete.";
    return {
      meteredWater: { status: "unavailable", message },
      commonWater: { status: "unavailable", message },
    };
  }

  const context = contextResult.data;
  const meteredWater = await (async (): Promise<August2026MeteredWaterChargeState> => {
    if (context.unitTypeCode !== "condo" || !context.unit.has_meter) {
      return { status: "not-applicable", message: "Metered water is not applicable for this Unit." };
    }

    const readings = context.readingsByUnit.get(unitId) ?? [];
    if (readings.length === 0) {
      return { status: "unavailable", message: "No July 2026 meter reading recorded." };
    }
    if (readings.length > 1) {
      return { status: "unavailable", message: "July 2026 meter reading is ambiguous." };
    }

    const reading = readings[0] ?? null;
    if (!reading) {
      return { status: "unavailable", message: "No July 2026 meter reading recorded." };
    }
    if (reading.consumption === null) {
      return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
    }

    const bill = context.bill;
    if (!bill) {
      return { status: "unavailable", message: "Sedapal water bill has not been entered yet." };
    }

    const amountCents = parseMoneyCents(bill.amount);
    const unitConsumptionMilli = parseMilliUnits(reading.consumption);
    const masterConsumptionMilli = parseMilliUnits(bill.total_consumption);

    if (amountCents === null || unitConsumptionMilli === null) {
      return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
    }
    if (masterConsumptionMilli === null || masterConsumptionMilli <= BigInt(0)) {
      return { status: "unavailable", message: "July 2026 water rate cannot be calculated." };
    }

    const chargeCents =
      (amountCents * unitConsumptionMilli + masterConsumptionMilli / BigInt(2)) /
      masterConsumptionMilli;
    const rateMicros =
      (amountCents * BigInt(1000000) + masterConsumptionMilli / BigInt(2)) /
      masterConsumptionMilli;

    return {
      status: "available",
      data: {
        amount: formatDecimal(chargeCents, 2),
        periodRateText: formatDecimal(rateMicros, 6),
        unitConsumptionText: formatDecimal(unitConsumptionMilli, 3),
        sourceReadingMonthLabel: context.sourceReadingMonthLabel,
        billingMonthLabel: context.billingMonthLabel,
      },
    };
  })();

  const commonWater = await (async (): Promise<CommonWaterChargePreviewState> => {
    if (context.unitTypeCode !== "condo") {
      return { status: "not-applicable", message: "Common Water is not applicable for this Unit." };
    }

    if (context.completeness.totalExpectedCount === 0) {
      return { status: "unavailable", message: "No expected residential units are available." };
    }

    if (context.completeness.completedCount !== context.completeness.totalExpectedCount) {
      return { status: "unavailable", message: "Cannot be calculated because unit meter readings are incomplete." };
    }

    const eligibleUnitIds = context.eligibleUnitIds;
    if (eligibleUnitIds.length === 0) {
      return { status: "unavailable", message: "No eligible residential units are available." };
    }

    const bill = context.bill;
    if (!bill) {
      return { status: "unavailable", message: "Sedapal water bill has not been entered yet." };
    }

    const amountCents = parseMoneyCents(bill.amount);
    const totalConsumptionMilli = parseMilliUnits(bill.total_consumption);
    if (amountCents === null) {
      return { status: "unavailable", message: "Sedapal bill amount is invalid." };
    }
    if (totalConsumptionMilli === null || totalConsumptionMilli <= BigInt(0)) {
      return { status: "unavailable", message: "Sedapal bill total consumption is invalid." };
    }

    let summedMeteredChargeCents = BigInt(0);
    for (const unitId of eligibleUnitIds) {
      const rows = context.readingsByUnit.get(unitId) ?? [];
      if (rows.length === 0) {
        return { status: "unavailable", message: "Cannot be calculated because unit meter readings are incomplete." };
      }
      if (rows.length > 1) {
        return { status: "unavailable", message: "July 2026 meter reading is ambiguous." };
      }
      const consumptionMilli = parseMilliUnits(rows[0].consumption);
      if (consumptionMilli === null) {
        return { status: "unavailable", message: "July 2026 meter reading is incomplete." };
      }
      const chargeCents =
        (amountCents * consumptionMilli + totalConsumptionMilli / BigInt(2)) / totalConsumptionMilli;
      summedMeteredChargeCents += chargeCents;
    }

    if (summedMeteredChargeCents > amountCents) {
      return { status: "unavailable", message: "Common Water pool would be negative." };
    }

    const commonWaterPoolCents = amountCents - summedMeteredChargeCents;
    const unitCommonWaterChargeCents = roundToNearestInteger(commonWaterPoolCents, BigInt(64));

    return {
      status: "available",
      data: {
        billingMonthLabel: context.billingMonthLabel,
        sourceReadingMonthLabel: context.sourceReadingMonthLabel,
        completedCount: context.completeness.completedCount,
        expectedCount: context.completeness.totalExpectedCount,
        supplierAmount: formatDecimal(amountCents, 2),
        summedMeteredCharges: formatDecimal(summedMeteredChargeCents, 2),
        commonWaterPool: formatDecimal(commonWaterPoolCents, 2),
        unitCommonWaterCharge: formatDecimal(unitCommonWaterChargeCents, 2),
      },
    };
  })();

  return { meteredWater, commonWater };
}

export async function getSedapalBillCycleState(): Promise<SedapalBillCycleState> {
  return getSedapalBillCycleStateForCurrentReadingMonth();
}

export type {
  WaterBillFormState,
  WaterBillRecord,
  WaterBillSummary,
} from "./types";

export { commonWaterBillInputSchema } from "./validation";
