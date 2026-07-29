import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding, listUnitTypes, listUnits } from "@/server/units";

import { getCurrentWaterPeriodKey, getNextWaterPeriodKey, parseWaterPeriodKey } from "./period";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

type PeriodSummary = {
  period_key: string;
  period_label: string;
  status: "In Progress" | "Complete";
  status_source: "meter_readings" | "billing_period";
  progress_label: string;
  period_start: string;
  link_href: string;
};

export type WaterDomainHomeData = {
  current_month: PeriodSummary | null;
  previous_months: PeriodSummary[];
  start_month_href: string | null;
};

function formatPeriodLabel(periodKey: string) {
  const period = parseWaterPeriodKey(periodKey);
  return period?.periodLabel ?? periodKey;
}

export async function getWaterDomainHome(): Promise<QueryResult<WaterDomainHomeData>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: null };

  const supabase = await createClient();
  const [{ data: unitTypes, error: unitTypesError }, { data: buildingsUnits, error: unitsError }] =
    await Promise.all([listUnitTypes(), listUnits()]);

  if (unitTypesError) return { data: null as never, error: unitTypesError };
  if (unitsError) return { data: null as never, error: unitsError };

  const condoType = unitTypes.find((unitType) => unitType.code === "condo");
  if (!condoType) {
    return { data: null as never, error: "Condo unit type is missing." };
  }

  const condoUnits = buildingsUnits.filter((unit) => unit.unit_type_code === condoType.code);
  const expectedUnits = condoUnits.length;

  const [billingPeriodsResult, meterReadingsResult, utilityBillsResult] = await Promise.all([
    supabase
      .from("tb810_billing_periods")
      .select("id, period_year, period_month, starts_on, ends_on, status")
      .eq("building_id", buildingResult.data.id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    supabase
      .from("tb810_meter_readings")
      .select("unit_id, reading_date, reading_end, utility_type_id, status")
      .eq("building_id", buildingResult.data.id)
      .eq("utility_type_id", condoType.id)
      .order("reading_date", { ascending: false }),
    supabase
      .from("tb810_utility_bills")
      .select("id, billing_period_id, bill_date, status")
      .eq("building_id", buildingResult.data.id)
      .order("bill_date", { ascending: false }),
  ]);

  if (billingPeriodsResult.error) return { data: null as never, error: billingPeriodsResult.error.message };
  if (meterReadingsResult.error) return { data: null as never, error: meterReadingsResult.error.message };
  if (utilityBillsResult.error) return { data: null as never, error: utilityBillsResult.error.message };

  const billingPeriods = billingPeriodsResult.data ?? [];
  const meterReadings = meterReadingsResult.data ?? [];
  const utilityBills = utilityBillsResult.data ?? [];

  const periodMap = new Map<
    string,
    {
      period_key: string;
      period_label: string;
      period_start: string;
      billing_period_status: string | null;
      meter_unit_ids: Set<string>;
    }
  >();

  for (const period of billingPeriods) {
    const periodKey = `${period.period_year}-${String(period.period_month).padStart(2, "0")}`;
    periodMap.set(periodKey, {
      period_key: periodKey,
      period_label: formatPeriodLabel(periodKey),
      period_start: period.starts_on,
      billing_period_status: period.status,
      meter_unit_ids: new Set<string>(),
    });
  }

  for (const reading of meterReadings) {
    const readingDate = parseWaterPeriodKey(`${reading.reading_date.slice(0, 7)}`);
    if (!readingDate) continue;
    const entry =
      periodMap.get(readingDate.periodKey) ??
      {
        period_key: readingDate.periodKey,
        period_label: readingDate.periodLabel,
        period_start: readingDate.periodStartIso,
        billing_period_status: null,
        meter_unit_ids: new Set<string>(),
      };
    entry.meter_unit_ids.add(reading.unit_id);
    periodMap.set(readingDate.periodKey, entry);
  }

  for (const bill of utilityBills) {
    if (!bill.bill_date) continue;
    const period = parseWaterPeriodKey(`${bill.bill_date.slice(0, 7)}`);
    if (!period) continue;
    const entry =
      periodMap.get(period.periodKey) ??
      {
        period_key: period.periodKey,
        period_label: period.periodLabel,
        period_start: period.periodStartIso,
        billing_period_status: null,
        meter_unit_ids: new Set<string>(),
      };
    periodMap.set(period.periodKey, entry);
  }

  const entries = [...periodMap.values()]
    .map((entry) => {
      const capturedReadings = entry.meter_unit_ids.size;
      const complete = expectedUnits > 0 && capturedReadings >= expectedUnits;
      const status = complete || entry.billing_period_status === "closed" ? "Complete" : "In Progress";

      return {
        period_key: entry.period_key,
        period_label: entry.period_label,
        period_start: entry.period_start,
        status,
        status_source: entry.billing_period_status === "closed" ? "billing_period" : "meter_readings",
        progress_label: `${capturedReadings} of ${expectedUnits}`,
        link_href: `/water/${entry.period_key}`,
      } satisfies PeriodSummary;
    })
    .sort((a, b) => b.period_key.localeCompare(a.period_key));

  const currentMonth =
    entries.find((entry) => entry.status === "In Progress") ??
    entries[0] ??
    null;
  const previousMonths = entries.filter((entry) => entry.period_key !== currentMonth?.period_key);

  const latestPeriodKey = entries[0]?.period_key ?? getCurrentWaterPeriodKey();
  const nextPeriodKey = getNextWaterPeriodKey(latestPeriodKey) ?? getCurrentWaterPeriodKey();

  return {
    data: {
      current_month: currentMonth,
      previous_months: previousMonths,
      start_month_href: `/water/${nextPeriodKey}`,
    },
    error: null,
  };
}

export async function startNextWaterMonth() {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) return { data: null as never, error: "Current building not found." };

  const home = await getWaterDomainHome();
  if (home.error) return { data: null as never, error: home.error };

  const targetPeriodKey = home.data?.start_month_href?.split("/").pop() ?? getCurrentWaterPeriodKey();
  const period = parseWaterPeriodKey(targetPeriodKey);
  if (!period) return { data: null as never, error: "Invalid period." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tb810_billing_periods")
    .upsert(
      {
        building_id: buildingResult.data.id,
        period_year: period.year,
        period_month: period.month,
        starts_on: period.periodStartIso,
        ends_on: period.periodEndIso,
        status: "collecting_readings",
      },
      { onConflict: "building_id,period_year,period_month" },
    );

  if (error) return { data: null as never, error: error.message };

  return { data: { period_key: period.periodKey }, error: null };
}
