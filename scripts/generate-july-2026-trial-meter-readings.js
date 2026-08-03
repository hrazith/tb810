import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const BUILDING_NAME = "TB810";
const TARGET_MONTH_KEY = "2026-07";
const TARGET_READING_DATE = "2026-07-01";
const PREVIOUS_MONTH_KEY = "2026-06-01";
const TRIAL_PURPOSE = "common_water_completion_test_2026_07";
const TRIAL_MARKER = {
  trial_data: true,
  trial_purpose: TRIAL_PURPOSE,
};

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
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  return {
    dryRun: !argv.includes("--write"),
    write: argv.includes("--write"),
    cleanup: argv.includes("--cleanup"),
  };
}

function seedFromUnitNumber(unitNumber) {
  return [...String(unitNumber)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function deriveConsumption(unitNumber, juneConsumption) {
  const seed = seedFromUnitNumber(unitNumber);
  const base = Number.isFinite(juneConsumption) && juneConsumption > 0 ? juneConsumption : 3.25;
  const offset = ((seed % 11) - 5) * 0.08;
  const scaled = base * 0.92 + offset;
  return Math.max(0.5, Number(scaled.toFixed(3)));
}

function monthLabel(monthKey) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function toLegacyMetadata(existing, extra) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return { ...base, ...extra };
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: building, error: buildingError }, { data: utilityType, error: utilityError }] =
    await Promise.all([
      supabase.from("tb810_buildings").select("id, name").eq("name", BUILDING_NAME).maybeSingle(),
      supabase.from("tb810_utility_types").select("id, code, name").eq("code", "common_water").maybeSingle(),
    ]);

  if (buildingError) throw buildingError;
  if (utilityError) throw utilityError;
  if (!building) throw new Error("Current building not found.");
  if (!utilityType) throw new Error("Common Water utility type not found.");

  const { data: condoType, error: condoTypeError } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name")
    .eq("code", "condo")
    .maybeSingle();
  if (condoTypeError) throw condoTypeError;
  if (!condoType) throw new Error("Condo unit type not found.");

  const [{ data: units, error: unitsError }, { data: existingJuly, error: julyError }, { data: juneReadings, error: juneError }] =
    await Promise.all([
      supabase
        .from("tb810_units")
        .select("id, unit_number, unit_type_id")
        .eq("building_id", building.id)
        .order("display_order", { ascending: true })
        .order("unit_number", { ascending: true }),
      supabase
        .from("tb810_meter_readings")
        .select("id, unit_id, reading_date, reading_start, reading_end, consumption, status, notes, legacy_metadata")
        .eq("building_id", building.id)
        .eq("utility_type_id", utilityType.id)
        .eq("reading_month", TARGET_READING_DATE),
      supabase
        .from("tb810_meter_readings")
        .select("unit_id, reading_end, reading_date, consumption, legacy_metadata")
        .eq("building_id", building.id)
        .eq("utility_type_id", utilityType.id)
        .eq("reading_month", PREVIOUS_MONTH_KEY),
    ]);

  if (unitsError) throw unitsError;
  if (julyError) throw julyError;
  if (juneError) throw juneError;

  const condoUnits = (units ?? []).filter((unit) => unit.unit_type_id === condoType.id);
  const julyByUnit = new Map((existingJuly ?? []).map((row) => [row.unit_id, row]));
  const juneByUnit = new Map((juneReadings ?? []).map((row) => [row.unit_id, row]));

  const eligibleUnits = condoUnits.filter((unit) => !julyByUnit.has(unit.id));
  const skipped = [];
  const proposedRows = [];

  for (const unit of eligibleUnits) {
    const june = juneByUnit.get(unit.id);
    if (!june || june.reading_end === null || june.reading_end === undefined) {
      skipped.push({ unit_number: unit.unit_number, reason: "missing valid June predecessor" });
      continue;
    }

    const readingStart = Number(june.reading_end);
    const consumption = deriveConsumption(unit.unit_number, Number(june.consumption));
    const readingEnd = Number((readingStart + consumption).toFixed(3));

    proposedRows.push({
      building_id: building.id,
      unit_id: unit.id,
      utility_type_id: utilityType.id,
      reading_date: TARGET_READING_DATE,
      reading_start: readingStart,
      reading_end: readingEnd,
      consumption: Number((readingEnd - readingStart).toFixed(3)),
      unit_of_measure: "m³",
      status: "recorded",
      notes: `Trial data for July 2026 completion test.`,
      legacy_table: "tb810_trial_meter_readings",
      legacy_id: `trial-${unit.unit_number}-${TARGET_READING_DATE}`,
      legacy_metadata: toLegacyMetadata(null, TRIAL_MARKER),
    });
  }

  const summary = {
    targetSupabaseProject: url,
    building: { id: building.id, name: building.name },
    month: TARGET_MONTH_KEY,
    monthLabel: monthLabel(TARGET_MONTH_KEY),
    existingJulyCount: (existingJuly ?? []).length,
    proposedRowCount: proposedRows.length,
    skippedUnitCount: skipped.length,
    skipped,
    writesTrialData: true,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (args.dryRun || !args.write) {
    console.log("Dry-run only. Re-run with --write to persist trial rows.");
    return;
  }

  if (proposedRows.length === 0) {
    console.log("No trial rows to insert.");
    return;
  }

  const { error: insertError } = await supabase.from("tb810_meter_readings").insert(proposedRows);
  if (insertError) throw insertError;

  console.log(`Inserted ${proposedRows.length} trial meter readings.`);
}

if (process.argv.includes("--cleanup")) {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = async () => {
    const { data, error } = await supabase
      .from("tb810_meter_readings")
      .select("id, unit_id, legacy_metadata")
      .contains("legacy_metadata", TRIAL_MARKER);

    if (error) throw error;

    console.log(
      JSON.stringify(
        {
          cleanupScope: TRIAL_PURPOSE,
          rowsToDelete: (data ?? []).length,
          writesTrialData: false,
        },
        null,
        2,
      ),
    );

    if (!process.argv.includes("--write")) {
      console.log("Cleanup dry-run only. Re-run with --write to delete trial rows.");
      return;
    }

    const ids = (data ?? []).map((row) => row.id);
    if (ids.length === 0) {
      console.log("No trial rows found.");
      return;
    }

    const { error: deleteError } = await supabase.from("tb810_meter_readings").delete().in("id", ids);
    if (deleteError) throw deleteError;
    console.log(`Deleted ${ids.length} trial meter readings.`);
  };

  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
