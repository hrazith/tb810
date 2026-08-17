import { createClient } from "@/lib/supabase/server";
import {
  getActiveDevTestSessionId,
  isRecordCreatedByActiveDevTestSession,
  recordDevTestMutation,
} from "@/server/dev-test-session";
import { getCurrentBuilding, listUnits } from "@/server/units";

import {
  currentMonthKey,
  defaultStartMonthForNewCharge,
  firstDayOfMonth,
  isChargeEligibleForMonth,
  monthLabel,
  previousMonthKey,
} from "./month";
import type { ChargeInput, ChargeLineItem, ChargeRecord, ChargeSummary } from "./types";

type QueryResult<T> = { data: T; error: string | null };

function monthKeyFromDate(date: string) {
  return date.slice(0, 7);
}

function isUnitCharge(row: ChargeRecord) {
  return row.unit_id != null && row.owner_id == null;
}

async function summarizeState(row: ChargeRecord) {
  const currentMonth = await currentMonthKey();
  if (row.effective_from_month.slice(0, 7) > currentMonth) return "future" as const;
  if (row.effective_to_month && row.effective_to_month.slice(0, 7) < currentMonth) return "ended" as const;
  if (row.stop_note) return "stopped" as const;
  return "active" as const;
}

async function getCurrentBuildingId() {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: "Current building not found." };
  return { data: buildingResult.data.id, error: null };
}

function monthBefore(monthKey: string) {
  return previousMonthKey(monthKey);
}

function monthKeyFromDateTime(date: string) {
  return date.slice(0, 7);
}

function isUpcomingChargeForMonth(row: ChargeRecord, obligationMonth: string) {
  return monthKeyFromDateTime(row.effective_from_month) > obligationMonth;
}

function selectUpcomingChargesForTarget(
  charges: ChargeRecord[],
  target: { unitId?: string; ownerId?: string },
  obligationMonth: string,
) {
  return charges
    .filter((row) => {
      if (target.unitId && (row.unit_id !== target.unitId || row.owner_id !== null)) return false;
      if (target.ownerId && (row.owner_id !== target.ownerId || row.unit_id !== null)) return false;
      return isUpcomingChargeForMonth(row, obligationMonth);
    })
    .sort((left, right) => {
      const monthCompare = left.effective_from_month.localeCompare(right.effective_from_month);
      if (monthCompare !== 0) return monthCompare;
      return right.created_at.localeCompare(left.created_at);
    });
}

export { selectUpcomingChargesForTarget };

function chargeMonthKey(charge: ChargeRecord) {
  return monthKeyFromDate(charge.effective_from_month);
}

export function isFutureEffectiveCharge(charge: ChargeRecord, currentMonth: string) {
  return chargeMonthKey(charge) > currentMonth;
}

export function validateFutureChargeInput(input: {
  schedule: "one_off" | "recurring";
  starts_month: string;
  ends_month?: string | null;
  currentMonth: string;
}) {
  const defaultStartMonth = defaultStartMonthForNewCharge(input.currentMonth);
  if (input.starts_month < defaultStartMonth) {
    return { error: `Start month cannot be before ${defaultStartMonth}.` };
  }
  if (input.schedule === "one_off" && input.ends_month) {
    return { error: "One-off charges cannot have an end month." };
  }
  if (input.schedule === "recurring" && input.ends_month && input.ends_month < input.starts_month) {
    return { error: "End month cannot be before the start month." };
  }
  const effectiveFromMonth = firstDayOfMonth(input.starts_month);
  if (!effectiveFromMonth) return { error: "Invalid start month." };
  const effectiveToMonth = input.ends_month ? firstDayOfMonth(input.ends_month) : null;
  if (input.ends_month && !effectiveToMonth) return { error: "Invalid end month." };
  return {
    error: null as string | null,
    effectiveFromMonth,
    effectiveToMonth,
  };
}

export function canStopCharge(charge: ChargeRecord) {
  return charge.schedule === "recurring";
}

export function canDeleteFutureChargeSeries(seriesRows: ChargeRecord[], currentMonth: string) {
  return seriesRows.length > 0 && seriesRows.every((row) => isFutureEffectiveCharge(row, currentMonth));
}

export async function editFutureCharge(
  chargeId: string,
  input: {
    description: string;
    amount: number;
    schedule: "one_off" | "recurring";
    starts_month: string;
    ends_month?: string | null;
  },
): Promise<QueryResult<ChargeRecord>> {
  const chargeResult = await getCharge(chargeId);
  if (chargeResult.error) return { data: null as never, error: chargeResult.error };
  if (!chargeResult.data) return { data: null as never, error: "Charge not found." };

  const currentMonth = await currentMonthKey();
  const current = chargeResult.data;
  if (!isFutureEffectiveCharge(current, currentMonth)) {
    return { data: null as never, error: "Future charges only can be edited." };
  }

  const validated = validateFutureChargeInput({
    schedule: input.schedule,
    starts_month: input.starts_month,
    ends_month: input.ends_month ?? null,
    currentMonth,
  });
  if (validated.error) return { data: null as never, error: validated.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_charges")
    .update({
      description: input.description,
      amount: input.amount,
      schedule: input.schedule,
      effective_from_month: validated.effectiveFromMonth,
      effective_to_month: validated.effectiveToMonth,
      stop_note: null,
    })
    .eq("id", chargeId)
    .eq("building_id", current.building_id)
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .single();
  if (error) return { data: null as never, error: error.message };
  return { data: data as ChargeRecord, error: null };
}

export async function deleteFutureCharge(chargeId: string): Promise<QueryResult<{ id: string; series_id: string }>> {
  const chargeResult = await getCharge(chargeId);
  if (chargeResult.error) return { data: null as never, error: chargeResult.error };
  if (!chargeResult.data) return { data: null as never, error: "Charge not found." };

  const currentMonth = await currentMonthKey();
  const current = chargeResult.data;
  if (!isFutureEffectiveCharge(current, currentMonth)) {
    return { data: null as never, error: "Future charges only can be deleted." };
  }

  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };

  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: null as never, error: "Current building not found." };

  const { data: seriesRows, error: seriesError } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingId)
    .eq("series_id", current.series_id);
  if (seriesError) return { data: null as never, error: seriesError.message };

  const rows = (seriesRows ?? []) as ChargeRecord[];
  if (!canDeleteFutureChargeSeries(rows, currentMonth)) {
    return { data: null as never, error: "Future charges only can be deleted." };
  }

  const { error } = await supabase
    .from("tb810_charges")
    .delete()
    .eq("building_id", buildingId)
    .eq("series_id", current.series_id);
  if (error) return { data: null as never, error: error.message };

  return { data: { id: current.id, series_id: current.series_id }, error: null };
}

export async function listCharges(): Promise<QueryResult<ChargeSummary[]>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: [], error: buildingResult.error };

  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: [], error: "Current building not found." };
  const [chargesResult, unitsResult] = await Promise.all([
    supabase
      .from("tb810_charges")
      .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
      .eq("building_id", buildingId)
      .order("series_id", { ascending: true })
      .order("effective_from_month", { ascending: false }),
    listUnits(),
  ]);

  if (chargesResult.error) return { data: [], error: chargesResult.error.message };
  if (unitsResult.error) return { data: [], error: unitsResult.error };

  const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit]));
  const latestBySeries = new Map<string, ChargeRecord>();
  for (const row of (chargesResult.data ?? []) as ChargeRecord[]) {
    if (!latestBySeries.has(row.series_id)) latestBySeries.set(row.series_id, row);
  }

  return {
    data: await Promise.all([...latestBySeries.values()].map(async (row) => ({
      ...row,
      target_label: isUnitCharge(row) ? "Unit" : "Owner",
      target_unit_number: row.unit_id ? unitById.get(row.unit_id)?.unit_number ?? null : null,
      current_amount: row.amount,
      current_effective_from_month: monthKeyFromDate(row.effective_from_month),
      current_effective_to_month: row.effective_to_month ? monthKeyFromDate(row.effective_to_month) : null,
      current_stop_note: row.stop_note,
      state: await summarizeState(row),
    }))),
    error: null,
  };
}

export async function getCharge(chargeId: string): Promise<QueryResult<ChargeRecord | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("id", chargeId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data ?? null) as ChargeRecord | null, error: null };
}

export async function createUnitCharge(input: ChargeInput): Promise<QueryResult<ChargeRecord>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  const supabase = await createClient();
  const unitResult = await supabase.from("tb810_units").select("id").eq("id", input.unit_id).maybeSingle();
  if (unitResult.error) return { data: null as never, error: unitResult.error.message };
  if (!unitResult.data) return { data: null as never, error: "Unit not found." };

  const startMonth = input.starts_month;
  const currentMonth = await currentMonthKey();
  const defaultStartMonth = defaultStartMonthForNewCharge(currentMonth);
  if (startMonth < defaultStartMonth) {
    return { data: null as never, error: `Start month cannot be before ${defaultStartMonth}.` };
  }
  if (input.schedule === "one_off" && input.ends_month) {
    return { data: null as never, error: "One-off charges cannot have an end month." };
  }
  if (input.schedule === "recurring" && input.ends_month && input.ends_month < startMonth) {
    return { data: null as never, error: "End month cannot be before the start month." };
  }
  const effectiveFromMonth = firstDayOfMonth(startMonth);
  if (!effectiveFromMonth) return { data: null as never, error: "Invalid start month." };
  const effectiveToMonth = input.ends_month ? firstDayOfMonth(input.ends_month) : null;
  if (input.ends_month && !effectiveToMonth) return { data: null as never, error: "Invalid end month." };
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: null as never, error: "Current building not found." };

  const { data, error } = await supabase
    .from("tb810_charges")
    .insert({
      building_id: buildingId,
      unit_id: input.unit_id,
      owner_id: null,
      description: input.description,
      amount: input.amount,
      schedule: input.schedule,
      effective_from_month: effectiveFromMonth,
      effective_to_month: effectiveToMonth,
    })
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .single();
  if (error) return { data: null as never, error: error.message };
  await recordDevTestMutation({
    domain: "charge",
    recordType: "charge_series",
    operation: "create",
    recordIdentity: data.series_id,
  });
  return { data, error: null };
}

export async function changeFutureChargeEconomics(
  chargeId: string,
  input: { amount: number; effective_month: string },
): Promise<QueryResult<ChargeRecord>> {
  const chargeResult = await getCharge(chargeId);
  if (chargeResult.error) return { data: null as never, error: chargeResult.error };
  if (!chargeResult.data) return { data: null as never, error: "Charge not found." };
  const current = chargeResult.data;
  if (current.schedule !== "recurring") {
    return { data: null as never, error: "Only recurring charges can change future economics." };
  }
  const activeSessionId = await getActiveDevTestSessionId();
  if (activeSessionId) {
    const createdBySession = await isRecordCreatedByActiveDevTestSession({
      domain: "charge",
      recordType: "charge_series",
      recordIdentity: current.series_id,
    });
    if (!createdBySession) {
      return { data: null as never, error: "DEV test sessions only support edits to test-created charges." };
    }
  }
  const effectiveMonth = input.effective_month;
  const currentMonth = await currentMonthKey();
  if (effectiveMonth < currentMonth) return { data: null as never, error: "Effective month cannot be in the past." };
  if (effectiveMonth <= monthKeyFromDate(current.effective_from_month)) {
    return { data: null as never, error: "Effective month must be after the current charge start month." };
  }
  const nextEffectiveToMonth = monthBefore(effectiveMonth);
  const nextEffectiveToMonthDate = nextEffectiveToMonth ? firstDayOfMonth(nextEffectiveToMonth) : null;
  const effectiveFromMonthDate = firstDayOfMonth(effectiveMonth);
  if (!effectiveFromMonthDate) return { data: null as never, error: "Invalid effective month." };
  const supabase = await createClient();
  if (!nextEffectiveToMonthDate) return { data: null as never, error: "Invalid effective month." };
  const updateResult = await supabase
    .from("tb810_charges")
    .update({ effective_to_month: nextEffectiveToMonthDate })
    .eq("id", chargeId);
  if (updateResult.error) return { data: null as never, error: updateResult.error.message };
  const insertResult = await supabase
    .from("tb810_charges")
    .insert({
      series_id: current.series_id,
      building_id: current.building_id,
      unit_id: current.unit_id,
      owner_id: current.owner_id,
      description: current.description,
      amount: input.amount,
      schedule: current.schedule,
      effective_from_month: effectiveFromMonthDate,
      effective_to_month: current.effective_to_month,
      stop_note: null,
    })
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .single();
  if (insertResult.error) return { data: null as never, error: insertResult.error.message };
  return { data: insertResult.data as ChargeRecord, error: null };
}

export async function stopFutureCharge(
  chargeId: string,
  input: { stop_month: string; note: string },
): Promise<QueryResult<ChargeRecord>> {
  const chargeResult = await getCharge(chargeId);
  if (chargeResult.error) return { data: null as never, error: chargeResult.error };
  if (!chargeResult.data) return { data: null as never, error: "Charge not found." };
  const current = chargeResult.data;
  if (!canStopCharge(current)) {
    return { data: null as never, error: "Only recurring charges can be stopped." };
  }
  const activeSessionId = await getActiveDevTestSessionId();
  if (activeSessionId) {
    const createdBySession = await isRecordCreatedByActiveDevTestSession({
      domain: "charge",
      recordType: "charge_series",
      recordIdentity: current.series_id,
    });
    if (!createdBySession) {
      return { data: null as never, error: "DEV test sessions only support edits to test-created charges." };
    }
  }
  const stopMonth = input.stop_month;
  if (stopMonth <= monthKeyFromDate(current.effective_from_month)) {
    return { data: null as never, error: "Stop month must be after the start month." };
  }
  const supabase = await createClient();
  const stopMonthBefore = monthBefore(stopMonth);
  const stopMonthBeforeDate = stopMonthBefore ? firstDayOfMonth(stopMonthBefore) : null;
  if (!stopMonthBeforeDate) return { data: null as never, error: "Invalid stop month." };
  const { data, error } = await supabase
    .from("tb810_charges")
    .update({
      effective_to_month: stopMonthBeforeDate,
      stop_note: input.note,
    })
    .eq("id", chargeId)
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function getUnitChargesForObligationMonth(unitId: string, obligationMonth: string): Promise<QueryResult<{ amount: string; lineItems: ChargeLineItem[] }>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: null as never, error: "Current building not found." };
  const { data, error } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingId)
    .eq("unit_id", unitId);
  if (error) return { data: null as never, error: error.message };
  const lineItems = ((data ?? []) as ChargeRecord[])
    .filter((row) =>
      row.owner_id == null &&
      isChargeEligibleForMonth({
        schedule: row.schedule,
        effectiveFromMonth: row.effective_from_month.slice(0, 7),
        effectiveToMonth: row.effective_to_month ? row.effective_to_month.slice(0, 7) : null,
        obligationMonth,
      }),
    )
    .map((row) => ({
      chargeId: row.id,
      description: row.description,
      amount: row.amount.toFixed(2),
      effectiveFromMonth: monthKeyFromDate(row.effective_from_month),
      effectiveToMonth: row.effective_to_month ? monthKeyFromDate(row.effective_to_month) : null,
    }));
  const total = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
  return { data: { amount: total.toFixed(2), lineItems }, error: null };
}

export async function getOwnerDirectChargesForObligationMonth(
  ownerId: string,
  obligationMonth: string,
): Promise<QueryResult<{ amount: string; count: number; lineItems: ChargeLineItem[] }>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: null as never, error: "Current building not found." };
  const { data, error } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingId)
    .eq("owner_id", ownerId);
  if (error) return { data: null as never, error: error.message };
  const lineItems = ((data ?? []) as ChargeRecord[])
    .filter((row) =>
      row.unit_id == null &&
      isChargeEligibleForMonth({
        schedule: row.schedule,
        effectiveFromMonth: row.effective_from_month.slice(0, 7),
        effectiveToMonth: row.effective_to_month ? row.effective_to_month.slice(0, 7) : null,
        obligationMonth,
      }),
    )
    .map((row) => ({
      chargeId: row.id,
      description: row.description,
      amount: row.amount.toFixed(2),
      effectiveFromMonth: monthKeyFromDate(row.effective_from_month),
      effectiveToMonth: row.effective_to_month ? monthKeyFromDate(row.effective_to_month) : null,
    }));
  const total = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
  return { data: { amount: total.toFixed(2), count: lineItems.length, lineItems }, error: null };
}

export async function getUpcomingUnitChargesForObligationMonth(
  unitId: string,
  obligationMonth: string,
): Promise<QueryResult<ChargeRecord[]>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: [], error: "Current building not found." };
  const { data, error } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingId)
    .eq("unit_id", unitId);
  if (error) return { data: [], error: error.message };
  return {
    data: selectUpcomingChargesForTarget((data ?? []) as ChargeRecord[], { unitId }, obligationMonth),
    error: null,
  };
}

export async function getUpcomingOwnerDirectChargesForObligationMonth(
  ownerId: string,
  obligationMonth: string,
): Promise<QueryResult<ChargeRecord[]>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: [], error: "Current building not found." };
  const { data, error } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingId)
    .eq("owner_id", ownerId);
  if (error) return { data: [], error: error.message };
  return {
    data: selectUpcomingChargesForTarget((data ?? []) as ChargeRecord[], { ownerId }, obligationMonth),
    error: null,
  };
}

export { monthLabel };
