import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  COMMON_WATER_CODE,
  buildHistoricalMeterReadingImport,
  readHistoricalLegacyMeterRows,
} from "../server/import/water/historical-meter-readings.js";

const DEFAULT_SQL_DUMP = path.resolve(process.cwd(), "legacy/sql/torrebal_admincondo.sql");
const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/tb810-historical-meter-readings-reconciliation.json",
);
const BUILDING_ID = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";

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
    source: DEFAULT_SQL_DUMP,
    report: DEFAULT_REPORT_PATH,
    dryRun: true,
    import: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--source") {
      args.source = argv[++i] ?? args.source;
      continue;
    }
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
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sqlPath = path.resolve(process.cwd(), args.source);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Source SQL dump not found: ${sqlPath}`);
  }

  const sourceRows = readHistoricalLegacyMeterRows(sqlPath);

  const [{ data: building, error: buildingError }, { data: utilityType, error: utilityError }] =
    await Promise.all([
      supabase.from("tb810_buildings").select("id, name").eq("id", BUILDING_ID).maybeSingle(),
      supabase
        .from("tb810_utility_types")
        .select("id, code, name")
        .eq("code", COMMON_WATER_CODE)
        .maybeSingle(),
    ]);

  if (buildingError) throw buildingError;
  if (utilityError) throw utilityError;
  if (!building) throw new Error("Canonical building not found.");
  if (!utilityType) throw new Error("Common water utility type not found.");

  const [{ data: unitTypes, error: unitTypesError }, { data: canonicalUnits, error: unitsError }] =
    await Promise.all([
      supabase.from("tb810_unit_types").select("id, code, name"),
      supabase.from("tb810_units").select("id, unit_number, unit_type_id").eq("building_id", BUILDING_ID),
    ]);

  if (unitTypesError) throw unitTypesError;
  if (unitsError) throw unitsError;

  const unitTypeCodeById = new Map((unitTypes ?? []).map((unitType) => [unitType.id, unitType.code]));

  const { data: canonicalReadings, error: readingsError } = await supabase
    .from("tb810_meter_readings")
    .select(
      "id, unit_id, reading_date, reading_start, reading_end, consumption, legacy_table, legacy_id, legacy_metadata",
    )
    .eq("building_id", BUILDING_ID)
    .eq("utility_type_id", utilityType.id);

  if (readingsError) throw readingsError;

  const normalizedUnits = (canonicalUnits ?? []).map((unit) => ({
    ...unit,
    unit_type_code: unitTypeCodeById.get(unit.unit_type_id) ?? null,
  }));

  const result = buildHistoricalMeterReadingImport({
    sourceRows,
    canonicalUnits: normalizedUnits,
    canonicalReadings: canonicalReadings ?? [],
    utilityTypeId: utilityType.id,
    buildingId: building.id,
  });

  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(JSON.stringify(result.summary, null, 2));

  if (args.dryRun) {
    return;
  }

  const rowsToInsert = result.mappedRows
    .filter((row) => !row.existing)
    .map((row) => ({
      building_id: row.building_id,
      unit_id: row.unit_id,
      utility_type_id: row.utility_type_id,
      reading_date: row.reading_date,
      reading_start: row.reading_start,
      reading_end: row.reading_end,
      consumption: row.consumption,
      unit_of_measure: row.unit_of_measure,
      status: row.status,
      notes: row.notes,
      legacy_table: row.legacy_table,
      legacy_id: row.legacy_id,
      legacy_metadata: row.legacy_metadata,
    }));

  if (rowsToInsert.length === 0) {
    console.log("No new historical rows to import.");
    return;
  }

  const { error: insertError } = await supabase.from("tb810_meter_readings").insert(rowsToInsert);
  if (insertError) throw insertError;

  console.log(`Imported ${rowsToInsert.length} historical meter readings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
