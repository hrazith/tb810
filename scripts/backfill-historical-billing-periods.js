import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  buildHistoricalBillingPeriodSequence,
  monthLabel,
  monthsBetween,
} from "../server/import/water/historical-billing-periods.js";

const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/tb810-historical-billing-period-backfill.json",
);
const RANGE_START = "2023-09";
const RANGE_END = "2026-08";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT_PATH,
    dryRun: true,
    import: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--report") {
      args.report = argv[++i] ?? args.report;
      continue;
    }
    if (value === "--import") {
      args.import = true;
      args.dryRun = false;
      continue;
    }
    if (value === "--dry-run") {
      args.dryRun = true;
      args.import = false;
    }
  }

  return args;
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buildings, error: buildingError } = await supabase
    .from("tb810_buildings")
    .select("id, name, created_at")
    .order("created_at", { ascending: true })
    .limit(2);

  if (buildingError) throw buildingError;
  if (!buildings?.length) throw new Error("Canonical building not found.");

  const building = buildings[0];
  const buildingVerification = {
    building_id: building.id,
    building_name: building.name,
    multiple_buildings_found: buildings.length > 1,
    building_count: buildings.length,
  };

  const { data: existingRows, error: periodsError } = await supabase
    .from("tb810_billing_periods")
    .select("id, building_id, period_year, period_month, starts_on, ends_on, status, created_at, updated_at")
    .eq("building_id", building.id)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  if (periodsError) throw periodsError;

  const desiredMonths = buildHistoricalBillingPeriodSequence(RANGE_START, RANGE_END);
  const desiredByKey = new Map(desiredMonths.map((period) => [period.periodKey, period]));
  const existingByKey = new Map(
    (existingRows ?? []).map((row) => [`${row.period_year}-${String(row.period_month).padStart(2, "0")}`, row]),
  );

  const existingMonths = [...existingByKey.keys()].sort();
  const newMonths = [];
  const matchedMonths = [];
  const duplicateMonths = [];
  const createdMonths = [];
  const warnings = [];
  const errors = [];
  const statusDistribution = {};

  for (const month of desiredMonths) {
    const existing = existingByKey.get(month.periodKey);
    if (existing) {
      matchedMonths.push({
        period_key: month.periodKey,
        existing_id: existing.id,
        status: existing.status,
      });
      statusDistribution[existing.status] = (statusDistribution[existing.status] ?? 0) + 1;
      continue;
    }

    newMonths.push(month);
    statusDistribution[month.status] = (statusDistribution[month.status] ?? 0) + 1;
  }

  for (const [monthKey, row] of existingByKey.entries()) {
    const occurrences = existingRows.filter(
      (item) => `${item.period_year}-${String(item.period_month).padStart(2, "0")}` === monthKey,
    ).length;
    if (occurrences > 1) {
      duplicateMonths.push({
        period_key: monthKey,
        count: occurrences,
      });
    }
  }

  const report = {
    range: {
      start: RANGE_START,
      end: RANGE_END,
    },
    building: buildingVerification,
    existing_months: existingMonths,
    new_months: newMonths.map((month) => ({
      period_key: month.periodKey,
      period_year: month.periodYear,
      period_month: month.periodMonth,
      starts_on: month.startsOn,
      ends_on: month.endsOn,
      status: month.status,
      label: monthLabel(month.periodYear, month.periodMonth),
    })),
    duplicate_months: duplicateMonths,
    missing_months: newMonths.map((month) => month.periodKey),
    created_months: createdMonths,
    matched_months: matchedMonths,
    status_distribution: statusDistribution,
    warnings,
    errors,
    notes: [
      "Historical Billing Periods are canonical monthly financial containers.",
      "Historical periods before the current month are created as closed.",
      "The current month in the approved range (2026-08) remains collecting_readings.",
      "Utility bill and downstream financial imports should resolve Billing Periods rather than creating them.",
    ],
  };

  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun) {
    return;
  }

  if (!newMonths.length) {
    console.log("No missing billing periods to create.");
    return;
  }

  const rowsToUpsert = newMonths.map((month) => ({
    building_id: building.id,
    period_year: month.periodYear,
    period_month: month.periodMonth,
    starts_on: month.startsOn,
    ends_on: month.endsOn,
    status: month.status,
  }));

  const { data: upserted, error: upsertError } = await supabase
    .from("tb810_billing_periods")
    .upsert(rowsToUpsert, { onConflict: "building_id,period_year,period_month" })
    .select("id, building_id, period_year, period_month, starts_on, ends_on, status");

  if (upsertError) throw upsertError;

  createdMonths.push(
    ...(upserted ?? []).map((row) => ({
      id: row.id,
      period_key: `${row.period_year}-${String(row.period_month).padStart(2, "0")}`,
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      status: row.status,
    })),
  );

  const finalExistingRows = await supabase
    .from("tb810_billing_periods")
    .select("id, building_id, period_year, period_month, starts_on, ends_on, status, created_at, updated_at")
    .eq("building_id", building.id)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  if (finalExistingRows.error) throw finalExistingRows.error;

  const finalExistingMonths = (finalExistingRows.data ?? [])
    .map((row) => `${row.period_year}-${String(row.period_month).padStart(2, "0")}`)
    .sort();

  const finalMatchedMonths = (finalExistingRows.data ?? []).map((row) => ({
    period_key: `${row.period_year}-${String(row.period_month).padStart(2, "0")}`,
    existing_id: row.id,
    status: row.status,
  }));

  report.existing_months = finalExistingMonths;
  report.new_months = [];
  report.missing_months = [];
  report.created_months = createdMonths;
  report.matched_months = finalMatchedMonths;
  report.status_distribution = finalExistingRows.data?.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `Created ${createdMonths.length} billing periods. Matched ${matchedMonths.length}. Existing ${existingMonths.length}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
