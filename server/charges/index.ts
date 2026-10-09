import { createClient } from "@/lib/supabase/server";
import {
  getActiveDevTestSessionId,
  isRecordCreatedByActiveDevTestSession,
  recordDevTestMutation,
} from "@/server/dev-test-session";
import { loadGiulianaPackageProgression, type GiulianaPackageProgression } from "@/server/obligations/progression";
import { isPerfLoggingEnabled } from "@/server/perf";
import { getCurrentBuilding, listUnits } from "@/server/units";
import { getOwnerById } from "@/server/owners";
import { getOwnerUnitsForBillingMonth } from "@/server/ownerships";

import {
  currentMonthKey,
  firstDayOfMonth,
  isChargeEligibleForMonth,
  monthLabel,
  previousMonthKey,
} from "./month";
import type { ChargeInput, ChargeLineItem, ChargeRecord, ChargeSummary } from "./types";

type QueryResult<T> = { data: T; error: string | null };

type ChargeLifecycleValidationResult =
  | { error: string; effectiveFromMonth?: never; effectiveToMonth?: never }
  | { error: null; effectiveFromMonth: string; effectiveToMonth: string | null };

function monthKeyFromDate(date: string) {
  return date.slice(0, 7);
}

function isUnitCharge(row: ChargeRecord) {
  return row.unit_id != null && row.owner_id == null;
}

// Charge editability follows the obligation package lifecycle, not the
// calendar. Charges may change from Giuliana's active package (the first one
// not yet handed off) onward; Unit Charges may also correct the latest
// ready_for_review package. Approved packages are never editable.
export type ChargeEditWindow = {
  activePackageMonth: string;
  correctionMonth: string | null;
};

export function isChargeMonthEditable(month: string, window: ChargeEditWindow, isUnitTarget: boolean) {
  return month >= window.activePackageMonth || (isUnitTarget && month === window.correctionMonth);
}

export function chargeEditWindowFromProgression(progression: GiulianaPackageProgression): ChargeEditWindow {
  return {
    activePackageMonth: progression.activePackage.obligationMonth,
    // pendingReviews are the ready_for_review packages, oldest first.
    correctionMonth: progression.pendingReviews.at(-1)?.obligationMonth ?? null,
  };
}

// One canonical progression read per charge operation, started from the same
// operating month as the Obligations workspace.
async function loadChargeEditWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
): Promise<QueryResult<ChargeEditWindow | null>> {
  const progression = await loadGiulianaPackageProgression({ buildingId, startMonth: await currentMonthKey(), client: supabase });
  if (progression.error || !progression.data) {
    return { data: null, error: progression.error ?? "Giuliana package progression unavailable." };
  }
  return { data: chargeEditWindowFromProgression(progression.data), error: null };
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

export function isChargeEditable(charge: ChargeRecord, window: ChargeEditWindow) {
  return isChargeMonthEditable(chargeMonthKey(charge), window, isUnitCharge(charge));
}

export function canStopCharge(charge: ChargeRecord) {
  return charge.schedule === "recurring";
}

// A whole series is removable only when every row is in the active package or
// later; correction deletes are limited to single-month series by the caller.
export function canDeleteChargeSeries(seriesRows: ChargeRecord[], window: ChargeEditWindow) {
  return seriesRows.length > 0 && seriesRows.every((row) => chargeMonthKey(row) >= window.activePackageMonth);
}

export function validateChargeLifecycleInput(input: {
  schedule: "one_off" | "recurring";
  starts_month: string;
  ends_month?: string | null;
}, window: ChargeEditWindow, isUnitTarget: boolean): ChargeLifecycleValidationResult {
  if (!isChargeMonthEditable(input.starts_month, window, isUnitTarget)) {
    return { error: `Start month cannot be before ${window.activePackageMonth}.` };
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
    error: null,
    effectiveFromMonth,
    effectiveToMonth,
  };
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

  const current = chargeResult.data;
  const supabase = await createClient();
  const window = await loadChargeEditWindow(supabase, current.building_id);
  if (window.error || !window.data) return { data: null as never, error: window.error ?? "Giuliana package progression unavailable." };
  if (!isChargeEditable(current, window.data)) {
    return { data: null as never, error: "Future charges only can be edited." };
  }
  const isCorrection = chargeMonthKey(current) < window.data.activePackageMonth;
  if (isCorrection && input.starts_month !== chargeMonthKey(current)) {
    return { data: null as never, error: "A handed-off charge must remain in its obligation month." };
  }

  const validated = validateChargeLifecycleInput({
    schedule: input.schedule,
    starts_month: input.starts_month,
    ends_month: input.ends_month ?? null,
  }, window.data, isUnitCharge(current));
  if (validated.error) return { data: null as never, error: validated.error };

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

  const current = chargeResult.data;
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };

  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: null as never, error: "Current building not found." };

  const window = await loadChargeEditWindow(supabase, buildingId);
  if (window.error || !window.data) return { data: null as never, error: window.error ?? "Giuliana package progression unavailable." };
  if (!isChargeEditable(current, window.data)) {
    return { data: null as never, error: "Future charges only can be deleted." };
  }
  const isCorrection = chargeMonthKey(current) < window.data.activePackageMonth;

  const { data: seriesRows, error: seriesError } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", buildingId)
    .eq("series_id", current.series_id);
  if (seriesError) return { data: null as never, error: seriesError.message };

  const rows = (seriesRows ?? []) as ChargeRecord[];
  if (isCorrection && rows.some((row) => chargeMonthKey(row) !== chargeMonthKey(current))) {
    return { data: null as never, error: "Only a single-month charge can be removed from a handed-off package." };
  }
  if (!isCorrection && !canDeleteChargeSeries(rows, window.data)) {
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

export async function createUnitCharge(
  input: ChargeInput,
  options?: { seriesId?: string },
): Promise<QueryResult<ChargeRecord>> {
  return createTargetCharge({
    unitId: input.unit_id,
    description: input.description,
    amount: input.amount,
    schedule: input.schedule,
    starts_month: input.starts_month,
    ends_month: input.ends_month,
    seriesId: options?.seriesId,
  });
}

async function createTargetCharge(input: {
  unitId?: string;
  ownerId?: string;
  description: string;
  amount: number;
  schedule: "one_off" | "recurring";
  starts_month: string;
  ends_month?: string | null;
  seriesId?: string;
}): Promise<QueryResult<ChargeRecord>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  const supabase = await createClient();
  const buildingId = buildingResult.data;
  if (!buildingId) return { data: null as never, error: "Current building not found." };

  if (input.unitId && input.ownerId) {
    return { data: null as never, error: "Charge target is invalid." };
  }
  if (!input.unitId && !input.ownerId) {
    return { data: null as never, error: "Charge target is required." };
  }

  if (input.unitId) {
    const unitResult = await supabase.from("tb810_units").select("id").eq("id", input.unitId).maybeSingle();
    if (unitResult.error) return { data: null as never, error: unitResult.error.message };
    if (!unitResult.data) return { data: null as never, error: "Unit not found." };
  }

  if (input.ownerId) {
    const ownerResult = await getOwnerById(input.ownerId);
    if (ownerResult.error) return { data: null as never, error: ownerResult.error };
    if (!ownerResult.data) return { data: null as never, error: "Owner not found." };

    const ownerUnitsResult = await getOwnerUnitsForBillingMonth(input.ownerId, await currentMonthKey());
    if (ownerUnitsResult.error) return { data: null as never, error: ownerUnitsResult.error };
    if (!ownerUnitsResult.data.length) {
      return { data: null as never, error: "Owner is not currently responsible for any units." };
    }
  }

  const window = await loadChargeEditWindow(supabase, buildingId);
  if (window.error || !window.data) return { data: null as never, error: window.error ?? "Giuliana package progression unavailable." };
  const validated = validateChargeLifecycleInput({
    schedule: input.schedule,
    starts_month: input.starts_month,
    ends_month: input.ends_month ?? null,
  }, window.data, Boolean(input.unitId));
  if (validated.error) return { data: null as never, error: validated.error };
  const successValidated = validated as Extract<ChargeLifecycleValidationResult, { error: null }>;
  const effectiveFromMonth = successValidated.effectiveFromMonth;
  const effectiveToMonth = successValidated.effectiveToMonth;
  const insertPayload: {
    building_id: string;
    unit_id: string | null;
    owner_id: string | null;
    description: string;
    amount: number;
    schedule: "one_off" | "recurring";
    effective_from_month: string;
    effective_to_month: string | null;
    series_id?: string;
  } = {
    building_id: buildingId,
    unit_id: input.unitId ?? null,
    owner_id: input.ownerId ?? null,
    description: input.description,
    amount: input.amount,
    schedule: input.schedule,
    effective_from_month: effectiveFromMonth,
    effective_to_month: effectiveToMonth,
  };
  if (input.seriesId) {
    insertPayload.series_id = input.seriesId;
  }
  const { data, error } = await supabase
    .from("tb810_charges")
    .insert(insertPayload)
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

export async function createOwnerDirectCharge(input: {
  owner_id: string;
  description: string;
  amount: number;
  schedule: "one_off" | "recurring";
  starts_month: string;
  ends_month?: string | null;
}): Promise<QueryResult<ChargeRecord>> {
  return createTargetCharge({
    ownerId: input.owner_id,
    description: input.description,
    amount: input.amount,
    schedule: input.schedule,
    starts_month: input.starts_month,
    ends_month: input.ends_month,
  });
}

export async function createBulkCharge(input: {
  target_kind: "all_units" | "all_owners";
  description: string;
  amount: number;
  schedule: "one_off" | "recurring";
  starts_month: string;
  ends_month?: string | null;
}): Promise<QueryResult<{ series_id: string | null; inserted_count: number; total_amount: number }>> {
  const buildingResult = await getCurrentBuildingId();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };
  const supabase = await createClient();
  const window = await loadChargeEditWindow(supabase, buildingResult.data);
  if (window.error || !window.data) return { data: null as never, error: window.error ?? "Giuliana package progression unavailable." };

  const validated = validateChargeLifecycleInput({
    schedule: input.schedule,
    starts_month: input.starts_month,
    ends_month: input.ends_month ?? null,
  }, window.data, input.target_kind === "all_units");
  if (validated.error) return { data: null as never, error: validated.error };

  const { data, error } = await (supabase as unknown as {
    rpc: (name: "tb810_create_bulk_charge", args: Record<string, unknown>) => Promise<{
      data: Array<{ series_id: string | null; inserted_count: number; total_amount: number }> | null;
      error: { message: string } | null;
    }>;
  }).rpc("tb810_create_bulk_charge", {
    p_target_kind: input.target_kind,
    p_description: input.description,
    p_amount: input.amount,
    p_schedule: input.schedule,
    p_starts_month: input.starts_month,
    p_ends_month: input.ends_month ?? null,
  });
  if (error) return { data: null as never, error: error.message };
  const result = data?.[0];
  if (!result) return { data: null as never, error: "Unable to create the charge." };
  return { data: result, error: null };
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
  const supabase = await createClient();
  const window = await loadChargeEditWindow(supabase, current.building_id);
  if (window.error || !window.data) return { data: null as never, error: window.error ?? "Giuliana package progression unavailable." };
  if (!isChargeMonthEditable(effectiveMonth, window.data, isUnitCharge(current))) {
    return { data: null as never, error: "Effective month cannot be in the past." };
  }
  if (effectiveMonth <= monthKeyFromDate(current.effective_from_month)) {
    return { data: null as never, error: "Effective month must be after the current charge start month." };
  }
  const nextEffectiveToMonth = monthBefore(effectiveMonth);
  const nextEffectiveToMonthDate = nextEffectiveToMonth ? firstDayOfMonth(nextEffectiveToMonth) : null;
  const effectiveFromMonthDate = firstDayOfMonth(effectiveMonth);
  if (!effectiveFromMonthDate) return { data: null as never, error: "Invalid effective month." };
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
  const window = await loadChargeEditWindow(supabase, current.building_id);
  if (window.error || !window.data) return { data: null as never, error: window.error ?? "Giuliana package progression unavailable." };
  if (!isChargeMonthEditable(stopMonth, window.data, isUnitCharge(current))) {
    return { data: null as never, error: `Stop month cannot be before ${window.data.activePackageMonth}.` };
  }
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
  const startedAt = process.hrtime.bigint();
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
  if (isPerfLoggingEnabled()) {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      [
        "[UPCOMING_UNIT_CHARGES_PERF]",
        `unit=${unitId}`,
        `month=${obligationMonth}`,
        `data_remote_requests=1`,
        `elapsed_ms=${elapsedMs.toFixed(1)}`,
      ].join(" "),
    );
  }
  return {
    data: selectUpcomingChargesForTarget((data ?? []) as ChargeRecord[], { unitId }, obligationMonth),
    error: null,
  };
}

export function calculateUpcomingUnitChargesFromFacts(
  charges: ChargeRecord[],
  unitId: string,
  obligationMonth: string,
): { amount: string; lineItems: ChargeLineItem[] } {
  const lineItems = selectUpcomingChargesForTarget(charges, { unitId }, obligationMonth).map((row) => ({
    chargeId: row.id,
    description: row.description,
    amount: row.amount.toFixed(2),
    effectiveFromMonth: monthKeyFromDate(row.effective_from_month),
    effectiveToMonth: row.effective_to_month ? monthKeyFromDate(row.effective_to_month) : null,
  }));
  const total = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
  return { amount: total.toFixed(2), lineItems };
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
