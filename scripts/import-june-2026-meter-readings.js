import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_SQL_DUMP = path.resolve(process.cwd(), "legacy/sql/torrebal_admincondo.sql");
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), "reports/tb810-meter-readings-june-2026-reconciliation.json");
const TARGET_READING_DATE = "2026-06-05";
const TARGET_YEAR_MONTH = "2026-06";
const LEGACY_TABLE = "meters";
const LEGACY_BATCH_ID = "meters_june_2026";
const BUILDING_ID = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";
const COMMON_WATER_CODE = "common_water";

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

function parseSqlLiteral(value) {
  if (value == null || value === "NULL") return null;
  return value.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
}

function splitSqlRow(rowText) {
  const values = [];
  let current = "";
  let inString = false;
  let escaped = false;

  for (const char of rowText) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "'") {
      inString = !inString;
      continue;
    }
    if (char === "," && !inString) {
      values.push(parseSqlLiteral(current.trim()));
      current = "";
      continue;
    }
    current += char;
  }

  values.push(parseSqlLiteral(current.trim()));
  return values;
}

function extractInsertBlock(sql, tableName) {
  const pattern = new RegExp(String.raw`INSERT INTO \`${tableName}\` \(([^)]+)\) VALUES\s*([\s\S]*?);`, "g");
  const blocks = [];
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    blocks.push({
      columns: match[1].split(",").map((column) => column.trim().replace(/`/g, "")),
      values: match[2],
    });
  }
  return blocks;
}

function extractRowsFromInsertBlock(block) {
  const rows = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of block) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }
    if (char === "(" && !inString) {
      depth += 1;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (char === ")" && !inString) {
      depth -= 1;
      if (depth === 0) {
        rows.push(splitSqlRow(current));
        current = "";
        continue;
      }
    }
    if (depth >= 1) {
      current += char;
    }
  }

  return rows;
}

function readLegacySource(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const meterBlocks = extractInsertBlock(sql, "meters");
  const unitBlocks = extractInsertBlock(sql, "units");
  const unitTypeBlocks = extractInsertBlock(sql, "unit_types");

  const unitTypes = new Map();
  for (const block of unitTypeBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null]));
      unitTypes.set(String(record.id), record);
    }
  }

  const units = new Map();
  for (const block of unitBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null]));
      units.set(String(record.id), {
        ...record,
        unit_type_name: unitTypes.get(String(record.unit_type_id))?.name ?? null,
      });
    }
  }

  const meterRows = [];
  for (const block of meterBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null]));
      meterRows.push({
        ...record,
        unit: units.get(String(record.unit_id)) ?? null,
      });
    }
  }

  return meterRows;
}

function monthKey(date) {
  return `${String(date).slice(0, 7)}`;
}

function isLegacyResidentialUnit(row) {
  return String(row.unit?.unit_type_name ?? "").toLowerCase() === "departamento";
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readingText(value) {
  return value == null ? null : Number(value).toFixed(3).replace(/\.?0+$/, "");
}

function buildReport({
  sourceRows,
  canonicalUnits,
  canonicalReadings,
  utilityTypeId,
  buildingId,
}) {
  const juneRows = sourceRows.filter((row) => row.reading_date === TARGET_READING_DATE);
  const residentialRows = juneRows.filter(isLegacyResidentialUnit);
  const byUnitNumber = new Map(canonicalUnits.map((unit) => [String(unit.unit_number), unit]));
  const existingByUnitId = new Map(canonicalReadings.map((reading) => [`${reading.unit_id}:${reading.reading_date}`, reading]));

  const mapped = [];
  const unmatched = [];
  const duplicates = [];
  const seen = new Set();

  for (const row of residentialRows) {
    const unitNumber = String(row.unit?.unit_number ?? "");
    const unit = byUnitNumber.get(unitNumber);
    if (!unit) {
      unmatched.push({ legacyUnitId: row.unit_id, unitNumber, reason: "No canonical condo unit found." });
      continue;
    }

    const key = `${unit.id}:${TARGET_READING_DATE}`;
    if (seen.has(key)) {
      duplicates.push({ unitNumber, legacyUnitId: row.unit_id });
      continue;
    }
    seen.add(key);

    const readingEnd = toNumber(row.reading);
    const readingStart = null;
    const consumption = null;
    const legacyMetadata = {
      legacy_source: LEGACY_TABLE,
      legacy_batch_id: LEGACY_BATCH_ID,
      legacy_unit_id: row.unit_id,
      legacy_service_metered: row.service_metered,
      legacy_month_consumed: row.month_consumed,
      legacy_month_consumption: row.month_consumption,
      legacy_created_at: row.created_at,
      legacy_updated_at: row.updated_at,
    };
    const existing = existingByUnitId.get(key) ?? null;
    mapped.push({
      building_id: buildingId,
      unit_id: unit.id,
      utility_type_id: utilityTypeId,
      reading_date: TARGET_READING_DATE,
      reading_start: readingStart,
      reading_end: readingEnd,
      consumption,
      unit_of_measure: "m3",
      status: "recorded",
      notes: `Legacy import June 2026 (${unitNumber})`,
      legacy_table: LEGACY_TABLE,
      legacy_id: `${LEGACY_BATCH_ID}:${row.id}`,
      legacy_metadata: legacyMetadata,
      existing,
      sourceRow: row,
      unitNumber,
      unit,
    });
  }

  const residentialUnitNumbers = new Set(residentialRows.map((row) => String(row.unit?.unit_number ?? "")).filter(Boolean));
  const missingUnits = canonicalUnits
    .filter((unit) => unit.unit_type_code === "condo" && !residentialUnitNumbers.has(String(unit.unit_number)))
    .map((unit) => String(unit.unit_number));

  return {
    juneRows,
    residentialRows,
    mapped,
    unmatched,
    duplicates,
    missingUnits,
    existingCount: mapped.filter((row) => row.existing).length,
    importedCount: mapped.filter((row) => !row.existing).length,
  };
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const sqlPath = path.resolve(process.cwd(), args.source);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Source SQL dump not found: ${sqlPath}`);
  }

  const sourceRows = readLegacySource(sqlPath);
  const { data: building, error: buildingError } = await supabase
    .from("tb810_buildings")
    .select("id, name")
    .eq("id", BUILDING_ID)
    .maybeSingle();
  if (buildingError) throw buildingError;
  if (!building) throw new Error("Canonical building not found.");

  const { data: utilityType, error: utilityError } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", COMMON_WATER_CODE)
    .maybeSingle();
  if (utilityError) throw utilityError;
  if (!utilityType) throw new Error("Common water utility type not found.");

  const { data: unitTypes, error: unitTypesError } = await supabase
    .from("tb810_unit_types")
    .select("id, code, name");
  if (unitTypesError) throw unitTypesError;

  const unitTypeIdByCode = new Map((unitTypes ?? []).map((unitType) => [unitType.code, unitType.id]));
  const unitTypeCodeById = new Map((unitTypes ?? []).map((unitType) => [unitType.id, unitType.code]));

  const { data: canonicalUnits, error: unitsError } = await supabase
    .from("tb810_units")
    .select("id, unit_number, unit_type_id")
    .eq("building_id", BUILDING_ID);
  if (unitsError) throw unitsError;

  const { data: canonicalReadings, error: readingsError } = await supabase
    .from("tb810_meter_readings")
    .select("id, unit_id, reading_date, reading_start, reading_end, consumption, legacy_table, legacy_id, legacy_metadata")
    .eq("building_id", BUILDING_ID)
    .eq("utility_type_id", utilityType.id)
    .eq("reading_date", TARGET_READING_DATE);
  if (readingsError) throw readingsError;

  const report = buildReport({
    sourceRows,
    canonicalUnits: (canonicalUnits ?? []).map((unit) => ({
      ...unit,
      unit_type_code: unitTypeCodeById.get(unit.unit_type_id) ?? null,
    })),
    canonicalReadings: canonicalReadings ?? [],
    utilityTypeId: utilityType.id,
    buildingId: building.id,
  });

  const summaries = {
    legacySourceTable: LEGACY_TABLE,
    legacyJuneRowsFound: report.juneRows.length,
    distinctLegacyUnitNumbers: [...new Set(report.residentialRows.map((row) => String(row.unit?.unit_number ?? "")))].filter(Boolean).length,
    rowsMappedSuccessfully: report.mapped.length,
    rowsUnmatched: report.unmatched.length,
    duplicateUnitReadings: report.duplicates.length,
    missingResidentialUnits: report.missingUnits.length,
    juneRepresentedBy: "reading_date",
    readingInitialInterpretation: "not present in this legacy source; June unit readings store only a single monthly reading value",
    readingFinalInterpretation: "legacy reading.value mapped to tb810_meter_readings.reading_end",
    consumptionInterpretation: "legacy month_consumption is the prior-month delta; preserved only in legacy_metadata for traceability",
    canonicalBuilding: building.name,
    canonicalUtilityType: utilityType.code,
    existingCanonicalJuneRows: report.existingCount,
  };

  const payload = {
    summary: summaries,
    unmatched: report.unmatched,
    duplicates: report.duplicates,
    missingUnits: report.missingUnits,
    rows: report.mapped.map((row) => ({
      unitNumber: row.unitNumber,
      unitId: row.unit.id,
      readingDate: row.reading_date,
      readingEnd: row.reading_end,
      legacyId: row.legacy_id,
      existing: Boolean(row.existing),
    })),
  };

  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(JSON.stringify(payload.summary, null, 2));

  if (args.dryRun) {
    return;
  }

  const rowsToInsert = report.mapped.filter((row) => !row.existing).map((row) => ({
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
    console.log("No new rows to import.");
    return;
  }

  const { error: insertError } = await supabase.from("tb810_meter_readings").insert(rowsToInsert);
  if (insertError) throw insertError;

  console.log(`Imported ${rowsToInsert.length} June 2026 meter readings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
