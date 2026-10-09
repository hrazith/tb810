import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getActiveDevTestSessionId, getActiveDevTestSessionSummary, recordDevTestMutation } from "@/server/dev-test-session";
import { getCurrentBuilding, listUnits } from "@/server/units";
import { getStaffContext } from "@/server/staff-context";
import { canEditSourceMonth, getActiveReadingMonth } from "@/server/water/unit-meter-readings";
import { parseGasWorkbook, type GasImportPreflight } from "./import";
import { buildMissingGasReadingDrafts, gasReadingDateForSourceMonth } from "./dev-completion";
import { isGasReadingDateInMonth } from "./date";

import type {
  GasBillInput,
  GasBillsWorkspaceData,
  GasProcessedBundle,
  GasBillRecord,
  GasBillSummary,
  GasReadingInput,
  GasReadingRecord,
  GasReadingSummary,
} from "./types";

type QueryResult<T> = { data: T; error: string | null };

type GasWorkbookImportResult = {
  importedBillCount: number;
  importedReadingCount: number;
};

type GasWorkbookImportResponse = QueryResult<GasWorkbookImportResult> & {
  imported: boolean;
  review: GasImportPreflight & {
    billMatches: number;
    readingMatches: number;
  };
};

type GasImportRpcRow = {
  unit_id: string;
  current_reading: number;
  reading_date: string;
};

type ConfirmedGasReading = {
  unit_number?: unknown;
  current_reading?: unknown;
  reading_date?: unknown;
};

const GAS_BILL_SELECT =
  "id, building_id, supplier_name, invoice_number, invoice_date, amount, notes, processed_at, legacy_table, legacy_id, legacy_metadata, created_at, updated_at" as const;
const GAS_READING_SELECT =
  "id, building_id, unit_id, reading_month, reading_date, previous_reading, current_reading, consumption, notes, legacy_table, legacy_id, legacy_metadata, created_at, updated_at" as const;

function statusFromBill(row: GasBillRecord) {
  return row.processed_at ? "processed" : "draft";
}

export function canMutateGasBills(roleKeys: string[]) {
  return roleKeys.includes("building_manager") || roleKeys.includes("super_admin");
}

async function gasBillMutationAuthorization() {
  const staffContext = await getStaffContext();
  return staffContext && canMutateGasBills(staffContext.roleKeys)
    ? null
    : "You are not authorized to manage Gas supplier bills.";
}

export function classifyGasBillMutationFailure(bill: GasBillSummary | null) {
  if (!bill) return "Bill not found or unavailable.";
  return bill.processed_at ? "Processed bills are read-only." : "Bill could not be changed.";
}

function preflightFromConfirmedRows(value: unknown): GasImportPreflight {
  const rows = Array.isArray(value) ? value.map((entry, index) => {
    const reading = entry && typeof entry === "object" ? entry as ConfirmedGasReading : {};
    const unitNumber = typeof reading.unit_number === "string" ? reading.unit_number.trim() : null;
    const currentNumber = typeof reading.current_reading === "number"
      ? reading.current_reading
      : typeof reading.current_reading === "string" && reading.current_reading.trim()
        ? Number(reading.current_reading)
        : Number.NaN;
    const currentReading = Number.isFinite(currentNumber) ? String(currentNumber) : null;
    const readingDate = typeof reading.reading_date === "string" ? reading.reading_date.trim() : null;
    return {
      sourceRowNumber: index + 2,
      kind: "reading" as const,
      data: {
        Unit: unitNumber,
        "Current Reading": currentReading,
        "Reading Date": readingDate,
      },
    };
  }) : [];
  return {
    rows,
    unmatchedRows: [],
    invalidRows: [],
    duplicateRows: [],
    unresolvedUnitNumbers: [],
    readingSheetDetected: true,
  };
}

function isCondoUnit(unitTypeCode: string) {
  return unitTypeCode === "condo";
}

type GasReviewRosterUnit = {
  id: string;
  unit_number: string;
  unit_type_code: "condo";
  has_gas_service: true;
};

async function listGasReviewRoster(buildingId: string): Promise<QueryResult<GasReviewRosterUnit[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, has_gas_service, tb810_unit_types!tb810_units_unit_type_id_fkey!inner(code)")
    .eq("building_id", buildingId)
    .eq("has_gas_service", true)
    .eq("tb810_unit_types.code", "condo")
    .order("unit_number", { ascending: true });
  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((unit) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      unit_type_code: "condo",
      has_gas_service: true,
    })),
    error: null,
  };
}

export function normalizeGasReadingMonth(month: string) {
  return `${month.slice(0, 7)}-01`;
}

export function gasReadingMonthKey(date: string) {
  return date.slice(0, 7);
}

function gasReadingDateError(readingDate: string, readingMonth: string) {
  return isGasReadingDateInMonth(readingDate, readingMonth)
    ? null
    : "Reading date must belong to the selected operational month.";
}

async function gasReadingMonthEditError(monthKey: string, referenceDate?: Date) {
  const correction = await canEditSourceMonth(monthKey, referenceDate);
  if (correction.error) return correction.error;
  return correction.allowed ? null : "Only the current editable Gas reading month can be changed.";
}

export async function getPreviousGasReadingForUnit({
  unitId,
  readingMonth,
}: {
  unitId: string;
  readingMonth: string;
}): Promise<QueryResult<GasReadingSummary | null>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: null, error: building.error };
  if (!building.data) return { data: null, error: "Building not found." };

  const readings = await listGasReadings();
  if (readings.error) return { data: null, error: readings.error };

  const previous = readings.data
    .filter((reading) => reading.unit_id === unitId && gasReadingMonthKey(reading.reading_month) < readingMonth)
    .sort((a, b) => b.reading_month.localeCompare(a.reading_month))[0] ?? null;

  return { data: previous, error: null };
}

export async function getGasCurrentBuilding() {
  return getCurrentBuilding();
}

export async function listGasBills(): Promise<QueryResult<GasBillSummary[]>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: [], error: building.error };
  if (!building.data) return { data: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .select(GAS_BILL_SELECT)
    .eq("building_id", building.data.id)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row) => ({ ...row, status: statusFromBill(row) })), error: null };
}

function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? monthKey
    : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function sourceIdsFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const sourceIds = (value as { sourceIds?: unknown }).sourceIds;
  return Array.isArray(sourceIds) ? sourceIds.filter((id): id is string => typeof id === "string") : [];
}

function asGasBillSummary(row: unknown): GasBillSummary {
  const bill = row as GasBillRecord;
  return { ...bill, status: statusFromBill(bill) };
}

type GenericQueryResult = { data: unknown[] | null; error: { message: string } | null };
type GenericQuery = {
  select(columns: string): GenericQuery;
  in(column: string, values: string[]): GenericQuery;
  eq(column: string, value: string): GenericQuery;
  then<TResult>(onfulfilled?: (value: GenericQueryResult) => TResult | PromiseLike<TResult>, onrejected?: (reason: unknown) => TResult | PromiseLike<TResult>): PromiseLike<TResult>;
};

export async function loadGasBillsWorkspace(): Promise<QueryResult<GasBillsWorkspaceData>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };
  const supabase = await createClient();

  const [pendingResult, periodsResult, processedResult] = await Promise.all([
    supabase
      .from("tb810_gas_bills")
      .select(GAS_BILL_SELECT)
      .eq("building_id", building.data.id)
      .is("processed_at", null)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("tb810_billing_periods")
      .select("id, period_year, period_month, approved_at")
      .eq("building_id", building.data.id)
      .in("status", ["approved", "invoices_generated", "closed"])
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    supabase
      .from("tb810_gas_bills")
      .select(GAS_BILL_SELECT)
      .eq("building_id", building.data.id)
      .not("processed_at", "is", null)
      .order("invoice_date", { ascending: false }),
  ]);
  if (pendingResult.error) return { data: null as never, error: pendingResult.error.message };
  if (periodsResult.error) return { data: null as never, error: periodsResult.error.message };
  if (processedResult.error) return { data: null as never, error: processedResult.error.message };

  const periods = periodsResult.data ?? [];
  const processedBills = (processedResult.data ?? []).map(asGasBillSummary);
  const periodIds = periods.map((period) => period.id);
  let obligationRows: Array<{ billing_period_id: string; calculation_snapshot: unknown }> = [];
  if (periodIds.length) {
    const obligationsResult = await (supabase as unknown as { from(table: string): GenericQuery })
      .from("tb810_monthly_financial_obligations")
      .select("billing_period_id, calculation_snapshot")
      .in("billing_period_id", periodIds)
      .eq("obligation_type", "gas_consumption");
    if (obligationsResult.error) return { data: null as never, error: obligationsResult.error.message };
    obligationRows = (obligationsResult.data ?? []) as typeof obligationRows;
  }

  const sourceIdsByPeriod = new Map<string, Set<string>>();
  for (const row of obligationRows) {
    const ids = sourceIdsFromSnapshot(row.calculation_snapshot);
    if (!sourceIdsByPeriod.has(row.billing_period_id)) sourceIdsByPeriod.set(row.billing_period_id, new Set());
    for (const id of ids) sourceIdsByPeriod.get(row.billing_period_id)?.add(id);
  }
  const nativeSourceIds = new Set(Array.from(sourceIdsByPeriod.values()).flatMap((ids) => Array.from(ids)));
  const referencedBillsResult = nativeSourceIds.size
    ? await supabase
      .from("tb810_gas_bills")
      .select(GAS_BILL_SELECT)
      .eq("building_id", building.data.id)
      .in("id", Array.from(nativeSourceIds))
    : { data: [], error: null };
  if (referencedBillsResult.error) return { data: null as never, error: referencedBillsResult.error.message };
  const billsById = new Map((referencedBillsResult.data ?? []).map(asGasBillSummary).map((bill) => [bill.id, bill]));
  const bundles: GasProcessedBundle[] = periods.flatMap((period) => {
    const ids = sourceIdsByPeriod.get(period.id);
    if (!ids?.size) return [];
    const bills = Array.from(ids).map((id) => billsById.get(id)).filter((bill): bill is GasBillSummary => Boolean(bill));
    if (!bills.length) return [];
    const monthKey = `${period.period_year}-${String(period.period_month).padStart(2, "0")}`;
    return [{
      billingPeriodId: period.id,
      monthKey,
      monthLabel: monthLabel(monthKey),
      processedAt: period.approved_at,
      bills,
    }];
  });
  const legacyProcessedBills = processedBills.filter((bill) => !nativeSourceIds.has(bill.id));

  return {
    data: {
      pendingBills: (pendingResult.data ?? []).map(asGasBillSummary),
      processedBundles: bundles,
      legacyProcessedBills,
    },
    error: null,
  };
}

export async function getGasBillById(id: string): Promise<QueryResult<GasBillSummary | null>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: null, error: building.error };
  if (!building.data) return { data: null, error: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .select(GAS_BILL_SELECT)
    .eq("id", id)
    .eq("building_id", building.data.id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: { ...data, status: statusFromBill(data) }, error: null };
}

export async function createGasBill(input: GasBillInput): Promise<QueryResult<GasBillRecord>> {
  const authorizationError = await gasBillMutationAuthorization();
  if (authorizationError) return { data: null as never, error: authorizationError };
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .insert({ ...input, building_id: building.data.id, processed_at: null })
    .select(GAS_BILL_SELECT)
    .single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function updateGasBill(id: string, input: GasBillInput): Promise<QueryResult<GasBillRecord>> {
  const authorizationError = await gasBillMutationAuthorization();
  if (authorizationError) return { data: null as never, error: authorizationError };
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .update({ ...input, building_id: building.data.id })
    .eq("id", id)
    .eq("building_id", building.data.id)
    .is("processed_at", null)
    .select(GAS_BILL_SELECT)
    .maybeSingle();
  if (error) return { data: null as never, error: error.message };
  if (!data) {
    const bill = await getGasBillById(id);
    if (bill.error) return { data: null as never, error: bill.error };
    return { data: null as never, error: classifyGasBillMutationFailure(bill.data) };
  }
  return { data, error: null };
}

export async function deleteGasBill(id: string): Promise<QueryResult<{ id: string }>> {
  const authorizationError = await gasBillMutationAuthorization();
  if (authorizationError) return { data: null as never, error: authorizationError };
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .delete()
    .eq("id", id)
    .eq("building_id", building.data.id)
    .is("processed_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { data: null as never, error: error.message };
  if (!data) {
    const bill = await getGasBillById(id);
    if (bill.error) return { data: null as never, error: bill.error };
    return { data: null as never, error: classifyGasBillMutationFailure(bill.data) };
  }
  return { data: { id }, error: null };
}

export async function listGasReadings(units?: Awaited<ReturnType<typeof listUnits>>["data"]): Promise<QueryResult<GasReadingSummary[]>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: [], error: building.error };
  if (!building.data) return { data: [], error: null };
  const supabase = await createClient();
  const readingsResult = await supabase.from("tb810_gas_readings").select(GAS_READING_SELECT).eq("building_id", building.data.id).order("reading_month", { ascending: false });
  const unitsResult = units ? { data: units, error: null as string | null } : await listUnits();
  const { data: readings, error } = readingsResult;
  if (error) return { data: [], error: error.message };
  if (unitsResult.error) return { data: [], error: unitsResult.error };
  const unitById = new Map(unitsResult.data.filter((unit) => isCondoUnit(unit.unit_type_code) && unit.has_gas_service).map((unit) => [unit.id, unit]));
  return {
    data: (readings ?? [])
      .map((row) => {
        const unit = unitById.get(row.unit_id);
        if (!unit) return null;
        return { ...row, unit_number: unit.unit_number, floor: unit.floor, unit_type_code: unit.unit_type_code };
      })
      .filter(Boolean) as GasReadingSummary[],
    error: null,
  };
}

export async function getGasReadingById(id: string): Promise<QueryResult<GasReadingSummary | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tb810_gas_readings").select(GAS_READING_SELECT).eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  const units = await listUnits();
  if (units.error) return { data: null, error: units.error };
  const unit = units.data.find((item) => item.id === data.unit_id);
  if (!unit || unit.unit_type_code !== "condo" || !unit.has_gas_service) return { data: null, error: null };
  return { data: { ...data, unit_number: unit.unit_number, floor: unit.floor, unit_type_code: unit.unit_type_code }, error: null };
}

export async function createGasReading(input: GasReadingInput): Promise<QueryResult<GasReadingRecord>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };
  const editError = await gasReadingMonthEditError(gasReadingMonthKey(input.reading_month));
  if (editError) return { data: null as never, error: editError };
  const readingDateError = gasReadingDateError(input.reading_date, gasReadingMonthKey(input.reading_month));
  if (readingDateError) return { data: null as never, error: readingDateError };
  const supabase = await createClient();
  const unitResult = await listUnits();
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  const unit = unitResult.data.find((item) => item.id === input.unit_id);
  if (!unit || unit.unit_type_code !== "condo" || !unit.has_gas_service) {
    return { data: null as never, error: "Only gas-enabled condo Units may receive Gas readings." };
  }
  const previousReadingResult = await getPreviousGasReadingForUnit({ unitId: input.unit_id, readingMonth: gasReadingMonthKey(normalizeGasReadingMonth(input.reading_month)) });
  if (previousReadingResult.error) return { data: null as never, error: previousReadingResult.error };
  const previousReading = previousReadingResult.data?.current_reading ?? null;
  if (previousReading != null && input.current_reading < previousReading) {
    return { data: null as never, error: "Current reading must be greater than or equal to previous reading." };
  }
  const payload = {
    ...input,
    building_id: building.data.id,
    reading_month: normalizeGasReadingMonth(input.reading_month),
    consumption: input.current_reading - (previousReading ?? 0),
  };
  const { data, error } = await supabase.from("tb810_gas_readings").insert(payload).select(GAS_READING_SELECT).single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function completeMissingGasReadingsForCurrentBusinessMonth(
  sourceReadingMonth: string,
): Promise<QueryResult<{ insertedCount: number }>> {
  if (process.env.NODE_ENV !== "development") {
    return { data: null as never, error: "DEV test actions are development-only." };
  }

  const session = await getActiveDevTestSessionSummary();
  if (!session) {
    return { data: null as never, error: "Start a DEV test session first." };
  }

  const sessionId = await getActiveDevTestSessionId();
  if (!sessionId) {
    return { data: null as never, error: "Start a DEV test session first." };
  }

  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };

  const readingDate = gasReadingDateForSourceMonth(sourceReadingMonth);
  if (!readingDate) return { data: null as never, error: "Gas source month is invalid." };
  const editError = await gasReadingMonthEditError(sourceReadingMonth, await getBusinessNow());
  if (editError) return { data: null as never, error: editError };

  const supabase = await createClient();
  const unitsResult = await listUnits();
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  const { data: readings, error: readingsError } = await supabase
    .from("tb810_gas_readings")
    .select(GAS_READING_SELECT)
    .eq("building_id", building.data.id)
    .order("reading_month", { ascending: false });
  if (readingsError) return { data: null as never, error: readingsError.message };

  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth,
    readingDate,
    units: unitsResult.data.map((unit) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      unit_type_code: unit.unit_type_code,
      has_gas_service: Boolean(unit.has_gas_service),
    })),
    readings: (readings ?? []).map((reading) => ({
      unit_id: reading.unit_id,
      reading_month: reading.reading_month,
      current_reading: reading.current_reading,
      previous_reading: reading.previous_reading,
      consumption: reading.consumption,
    })),
  });

  if (!drafts.length) {
    return { data: { insertedCount: 0 }, error: null };
  }

  let insertedCount = 0;
  const insertedIds: string[] = [];

  for (const draft of drafts) {
    const id = randomUUID();
    const { data, error } = await supabase
      .from("tb810_gas_readings")
      .insert({
        id,
        building_id: building.data.id,
        unit_id: draft.unitId,
        reading_month: draft.readingMonth,
        reading_date: draft.readingDate,
        previous_reading: draft.previousReading,
        current_reading: draft.currentReading,
        consumption: draft.consumption,
      })
      .select(GAS_READING_SELECT)
      .single();
    if (error) {
      if (insertedIds.length) {
        await supabase.from("tb810_gas_readings").delete().in("id", insertedIds);
      }
      return { data: null as never, error: error.message };
    }
    insertedIds.push(data.id);

    const journalResult = await recordDevTestMutation({
      domain: "gas",
      recordType: "meter_reading",
      operation: "create",
      recordIdentity: data.id,
    });
    if (journalResult.error) {
      await supabase.from("tb810_gas_readings").delete().eq("id", data.id);
      if (insertedIds.length) {
        await supabase.from("tb810_gas_readings").delete().in("id", insertedIds);
      }
      return { data: null as never, error: journalResult.error };
    }
    insertedCount += 1;
  }

  return { data: { insertedCount }, error: null };
}

export async function updateGasReading(id: string, input: GasReadingInput): Promise<QueryResult<GasReadingRecord>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };
  const existing = await getGasReadingById(id);
  if (existing.error) return { data: null as never, error: existing.error };
  if (!existing.data) return { data: null as never, error: "Reading not found." };
  const existingMonthError = await gasReadingMonthEditError(gasReadingMonthKey(existing.data.reading_month));
  if (existingMonthError) return { data: null as never, error: existingMonthError };
  const targetMonthError = await gasReadingMonthEditError(gasReadingMonthKey(input.reading_month));
  if (targetMonthError) return { data: null as never, error: targetMonthError };
  const readingDateError = gasReadingDateError(input.reading_date, gasReadingMonthKey(input.reading_month));
  if (readingDateError) return { data: null as never, error: readingDateError };
  const supabase = await createClient();
  const unitResult = await listUnits();
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  const unit = unitResult.data.find((item) => item.id === input.unit_id);
  if (!unit || unit.unit_type_code !== "condo" || !unit.has_gas_service) {
    return { data: null as never, error: "Only gas-enabled condo Units may receive Gas readings." };
  }
  const previousReadingResult = await getPreviousGasReadingForUnit({ unitId: input.unit_id, readingMonth: gasReadingMonthKey(normalizeGasReadingMonth(input.reading_month)) });
  if (previousReadingResult.error) return { data: null as never, error: previousReadingResult.error };
  const previousReading = previousReadingResult.data?.current_reading ?? null;
  if (previousReading != null && input.current_reading < previousReading) {
    return { data: null as never, error: "Current reading must be greater than or equal to previous reading." };
  }
  const payload = {
    ...input,
    building_id: building.data.id,
    reading_month: normalizeGasReadingMonth(input.reading_month),
    consumption: input.current_reading - (previousReading ?? 0),
  };
  const { data, error } = await supabase
    .from("tb810_gas_readings")
    .update(payload)
    .eq("id", id)
    .eq("building_id", building.data.id)
    .select(GAS_READING_SELECT)
    .single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function deleteGasReading(id: string): Promise<QueryResult<{ id: string }>> {
  const existing = await getGasReadingById(id);
  if (existing.error) return { data: null as never, error: existing.error };
  if (!existing.data) return { data: null as never, error: "Reading not found." };
  const editError = await gasReadingMonthEditError(gasReadingMonthKey(existing.data.reading_month));
  if (editError) return { data: null as never, error: editError };
  const supabase = await createClient();
  const { error } = await supabase.from("tb810_gas_readings").delete().eq("id", id);
  if (error) return { data: null as never, error: error.message };
  return { data: { id }, error: null };
}

export async function clearCurrentGasMonth(monthKey: string) {
  const activeMonth = getActiveReadingMonth();
  if (monthKey !== activeMonth.key) {
    return { data: null as never, error: "Only the current editable Gas month can be started over." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tb810_clear_current_gas_reading_month", {
    p_month_key: monthKey,
  });
  if (error) return { data: null as never, error: error.message };
  return { data: { deletedCount: Number(data ?? 0) }, error: null };
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export async function importGasWorkbook(
  file: File | null,
  confirmed = false,
  targetReadingMonth = "",
  importReadingDate = "",
  confirmedRows?: unknown,
): Promise<GasWorkbookImportResponse> {
  const supabase = await createClient();
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error, imported: false, review: { rows: [], unmatchedRows: [], invalidRows: [], duplicateRows: [], unresolvedUnitNumbers: [], billMatches: 0, readingMatches: 0 } };
  if (!building.data) return { data: null as never, error: "Building not found.", imported: false, review: { rows: [], unmatchedRows: [], invalidRows: [], duplicateRows: [], unresolvedUnitNumbers: [], billMatches: 0, readingMatches: 0 } };

  const rosterResult = await listGasReviewRoster(building.data.id);
  if (rosterResult.error) return { data: null as never, error: rosterResult.error, imported: false, review: { rows: [], unmatchedRows: [], invalidRows: [], duplicateRows: [], unresolvedUnitNumbers: [], billMatches: 0, readingMatches: 0 } };
  const condoByNumber = new Map(
    rosterResult.data.map((unit) => [unit.unit_number, unit]),
  );

  const preflight = file
    ? await parseGasWorkbook(file, importReadingDate)
    : preflightFromConfirmedRows(confirmedRows);
  const { rows } = preflight;
  const billRows = rows.filter((row) => row.kind === "bill");
  const readingRows = rows.filter((row) => row.kind === "reading");
  const readingUnresolvedUnitNumbers = readingRows.filter((row) => {
    const unitNumber = normalizeText(row.data["Unit"] ?? row.data["Unidad"] ?? row.data["Unit Number"]);
    return !unitNumber || !condoByNumber.has(unitNumber);
  }).map((row) => ({ sourceRowNumber: row.sourceRowNumber, reason: "Reading row did not resolve to a gas-enabled condo Unit." }));
  const readingRowsByUnit = new Map<string, typeof readingRows>();
  for (const row of readingRows) {
    const unitNumber = normalizeText(row.data["Unit"] ?? row.data["Unidad"] ?? row.data["Unit Number"]);
    const rowsForUnit = readingRowsByUnit.get(unitNumber) ?? [];
    rowsForUnit.push(row);
    readingRowsByUnit.set(unitNumber, rowsForUnit);
  }
  const duplicateReadingRows = Array.from(readingRowsByUnit.entries())
    .filter(([, rowsForUnit]) => rowsForUnit.length > 1)
    .map(([unitNumber, rowsForUnit]) => ({
      sourceRowNumber: rowsForUnit[0].sourceRowNumber,
      reason: `Unit ${unitNumber} appears more than once in the workbook.`,
    }));
  const review = {
    ...preflight,
    unmatchedRows: preflight.unmatchedRows,
    invalidRows: preflight.invalidRows,
    duplicateRows: [...preflight.duplicateRows, ...duplicateReadingRows],
    unresolvedUnitNumbers: [...preflight.unresolvedUnitNumbers, ...readingUnresolvedUnitNumbers],
    billMatches: billRows.length,
    readingMatches: readingRows.length,
    expectedUnitCount: condoByNumber.size,
    missingUnitNumbers: Array.from(condoByNumber.entries())
      .filter(([unitNumber]) => !readingRows.some((row) => (row.data["Unit"] ?? row.data["Unidad"] ?? row.data["Unit Number"])?.trim() === unitNumber))
      .map(([unitNumber]) => unitNumber),
    readyToImport: false,
  };
  const readingSetReady = Boolean(preflight.readingSheetDetected) && (
    readingRows.length === condoByNumber.size &&
    review.missingUnitNumbers.length === 0 &&
    review.unresolvedUnitNumbers.length === 0 &&
    review.invalidRows.length === 0 &&
    review.duplicateRows.length === 0
  );
  review.readyToImport = readingSetReady;
  if (!confirmed) {
    return { data: { importedBillCount: 0, importedReadingCount: 0 }, error: null, imported: false, review };
  }
  if (review.unmatchedRows.length || review.invalidRows.length || review.duplicateRows.length || review.unresolvedUnitNumbers.length) {
    return {
      data: null as never,
      error: "Workbook review failed. Resolve unmatched, invalid, duplicate, or unresolved rows before importing.",
      imported: false,
      review,
    };
  }

  if (readingRows.length && billRows.length) {
    return {
      data: null as never,
      error: "Upload a Gas readings workbook separately from supplier bills.",
      imported: false,
      review,
    };
  }

  if (readingRows.length) {
    if (!review.readyToImport) {
      return {
        data: null as never,
        error: "Workbook review failed. Complete every eligible Gas Unit exactly once before importing.",
        imported: false,
        review,
      };
    }
  }

  if (readingRows.length) {
    if (!/^\d{4}-\d{2}$/.test(targetReadingMonth)) {
      return { data: null as never, error: "A target operational month is required for Gas reading imports.", imported: false, review };
    }
    const editError = await gasReadingMonthEditError(targetReadingMonth);
    if (editError) return { data: null as never, error: editError, imported: false, review };
    for (const row of readingRows) {
      const readingDate = normalizeText(row.data["Reading Date"] ?? row.data["Fecha"] ?? row.data["Date"]) || importReadingDate;
      if (!isGasReadingDateInMonth(readingDate, targetReadingMonth)) {
        return { data: null as never, error: `Reading row ${row.sourceRowNumber} has a date outside the target operational month.`, imported: false, review };
      }
    }
  }

  if (!billRows.length && !readingRows.length) {
    return { data: { importedBillCount: 0, importedReadingCount: 0 }, error: null, imported: true, review };
  }

  let importedBillCount = 0;
  let importedReadingCount = 0;

  for (const row of billRows) {
    const supplier_name = normalizeText(row.data["Supplier"] ?? row.data["Supplier Name"] ?? row.data["Proveedor"]);
    const invoice_number = normalizeText(row.data["Invoice Number"] ?? row.data["Invoice"] ?? row.data["Nro Factura"]);
    const invoice_date = normalizeText(row.data["Invoice Date"] ?? row.data["Date"] ?? row.data["Fecha"]);
    const amount = Number(normalizeText(row.data["Amount"] ?? row.data["Importe"] ?? row.data["Monto"]));
    if (!supplier_name || !invoice_number || !invoice_date || !Number.isFinite(amount)) {
      return { data: null as never, error: `Bill row ${row.sourceRowNumber} is invalid after preflight review.`, imported: false, review };
    }
    const { error } = await supabase.from("tb810_gas_bills").upsert(
      {
        building_id: building.data.id,
        supplier_name,
        invoice_number,
        invoice_date,
        amount,
        notes: normalizeText(row.data["Notes"] ?? row.data["Comentarios"]) || null,
        legacy_table: "gas_spreadsheet",
        legacy_id: `${row.sourceRowNumber}`,
        legacy_metadata: { source_row_number: row.sourceRowNumber, worksheet_row: row.data },
      },
      { onConflict: "building_id,invoice_number" },
    );
    if (error) return { data: null as never, error: error.message, imported: false, review };
    importedBillCount += 1;
  }

  if (readingRows.length) {
    const rpcRows: GasImportRpcRow[] = [];
    for (const row of readingRows) {
      const unitNumber = normalizeText(row.data["Unit"] ?? row.data["Unidad"] ?? row.data["Unit Number"]);
      const readingDate = normalizeText(row.data["Reading Date"] ?? row.data["Fecha"] ?? row.data["Date"]) || importReadingDate;
      const currentReading = Number(normalizeText(row.data["Current Reading"] ?? row.data["Lectura"] ?? row.data["Reading"]));
      if (!unitNumber || !readingDate || !Number.isFinite(currentReading)) {
        return { data: null as never, error: `Reading row ${row.sourceRowNumber} is invalid after preflight review.`, imported: false, review };
      }
      const unit = condoByNumber.get(unitNumber);
      if (!unit) {
        return { data: null as never, error: `Reading row ${row.sourceRowNumber} did not resolve to a gas-enabled condo Unit.`, imported: false, review };
      }
      rpcRows.push({ unit_id: unit.id, current_reading: currentReading, reading_date: readingDate });
    }
    const sessionId = await getActiveDevTestSessionId();
    const rpcName = sessionId
      ? "tb810_sync_dev_gas_reading_import"
      : "tb810_sync_gas_reading_import";
    const rpcArgs = (rpcName === "tb810_sync_dev_gas_reading_import")
      ? { p_session_id: sessionId, p_month_key: targetReadingMonth, p_rows: rpcRows }
      : { p_month_key: targetReadingMonth, p_rows: rpcRows };
    const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string; details?: string; hint?: string } | null }> }).rpc(rpcName, rpcArgs);
    if (error) return { data: null as never, error: error.message, imported: false, review };
    const result = (Array.isArray(data) ? data[0] : data) as { processed_count?: number } | undefined;
    importedReadingCount = Number(result?.processed_count ?? readingRows.length);
  }

  return { data: { importedBillCount, importedReadingCount }, error: null, imported: true, review };
}

export { getGasChargePreviewsForUnit, getMonthlyGasObligationSummary } from "./provider";
