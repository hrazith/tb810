import { createHash } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import {
  getActiveDevTestSessionId,
  getActiveDevTestSessionSummary,
  isRecordCreatedByActiveDevTestSession,
  recordDevTestMutation,
} from "@/server/dev-test-session";
import { getBusinessNow } from "@/server/business-date";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";
import { getCurrentBuilding, listUnits } from "@/server/units";

import { createUnitCharge } from "./index";
import { nextMonthKey } from "./month";

type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

export type DevUnitChargeFixture = {
  buildingId: string;
  unitId: string;
  unitNumber: string;
  currentMonth: string;
  upcomingMonth: string;
  seriesId: string;
  description: string;
  amount: number;
  schedule: "one_off";
  startsMonth: string;
};

function hashToUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).padEnd(32, "0");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function selectDevUnitChargeTarget(units: Array<{ id: string; unit_number: string; unit_type_code: string; active: boolean }>) {
  return (
    units.find((unit) => unit.unit_type_code === "condo" && unit.active) ??
    units.find((unit) => unit.unit_type_code === "condo") ??
    null
  );
}

export function buildDevUnitChargeFixture(input: {
  buildingId: string;
  unitId: string;
  unitNumber: string;
  currentMonth: string;
}): DevUnitChargeFixture {
  const upcomingMonth = nextMonthKey(input.currentMonth) ?? input.currentMonth;
  return {
    buildingId: input.buildingId,
    unitId: input.unitId,
    unitNumber: input.unitNumber,
    currentMonth: input.currentMonth,
    upcomingMonth,
    seriesId: hashToUuid([
      "tb810-dev-unit-charge",
      input.buildingId,
      input.unitId,
      upcomingMonth,
      "DEV September test charge",
      "25.00",
    ].join(":")),
    description: `DEV test charge for Unit ${input.unitNumber}`,
    amount: 25,
    schedule: "one_off",
    startsMonth: upcomingMonth,
  };
}

export async function addUnitChargeForCurrentBusinessMonth(): Promise<QueryResult<{ insertedCount: number; chargeSeriesId: string }>> {
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
  if (!building.data) return { data: null as never, error: "Current building not found." };

  const businessNow = await getBusinessNow();
  const currentMonth = `${businessNow.getUTCFullYear()}-${String(businessNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const supabase = await createClient();

  const unitsResult = await listUnits();
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  const targetUnit = selectDevUnitChargeTarget(
    (unitsResult.data ?? []).map((unit) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      unit_type_code: unit.unit_type_code,
      active: unit.active,
    })),
  );
  if (!targetUnit) {
    return { data: null as never, error: "No eligible condo unit is available for the DEV charge fixture." };
  }

  const fixture = buildDevUnitChargeFixture({
    buildingId: building.data.id,
    unitId: targetUnit.id,
    unitNumber: targetUnit.unit_number,
    currentMonth,
  });

  const { data: existing, error: existingError } = await supabase
    .from("tb810_charges")
    .select("id, series_id, building_id, unit_id, owner_id, description, amount, schedule, effective_from_month, effective_to_month, stop_note, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at")
    .eq("building_id", fixture.buildingId)
    .eq("series_id", fixture.seriesId)
    .eq("effective_from_month", `${fixture.startsMonth}-01`)
    .maybeSingle();
  if (existingError) return { data: null as never, error: existingError.message };

  if (existing) {
    const recorded = await isRecordCreatedByActiveDevTestSession({
      domain: "charge",
      recordType: "charge_series",
      recordIdentity: fixture.seriesId,
    });
    if (!recorded) {
      const journalResult = await recordDevTestMutation({
        domain: "charge",
        recordType: "charge_series",
        operation: "create",
        recordIdentity: fixture.seriesId,
      });
      if (journalResult.error) return { data: null as never, error: journalResult.error };
    }
    invalidateBuildingMonthFinancialFactsCache(fixture.buildingId);
    return { data: { insertedCount: 0, chargeSeriesId: fixture.seriesId }, error: null };
  }

  const result = await createUnitCharge({
    unit_id: fixture.unitId,
    description: fixture.description,
    amount: fixture.amount,
    schedule: fixture.schedule,
    starts_month: fixture.startsMonth,
  } as const, { seriesId: fixture.seriesId });

  if (result.error) return { data: null as never, error: result.error };

  invalidateBuildingMonthFinancialFactsCache(fixture.buildingId);
  return { data: { insertedCount: 1, chargeSeriesId: result.data.series_id }, error: null };
}
