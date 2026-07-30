import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  buildUnitImportReport,
  canonicalUnitTypeSeeds,
  detectParticipationScale,
  normalizeUnitImportRow,
} from "../server/units/import.ts";

const canonicalUnitTypeIds = {
  condo: "c2bc6a40-7d8e-4d1d-8c8b-8a1a76f3e001",
  parking: "c2bc6a40-7d8e-4d1d-8c8b-8a1a76f3e002",
  storage: "c2bc6a40-7d8e-4d1d-8c8b-8a1a76f3e003",
};

const DEFAULT_SQL_DUMP = path.resolve(process.cwd(), "legacy/sql/torrebal_admincondo.sql");

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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
    buildingId: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--source") {
      args.source = argv[++i] ?? null;
      continue;
    }
    if (value === "--building-id") {
      args.buildingId = argv[++i] ?? null;
      continue;
    }
    if (value === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function parseSqlLiteral(value) {
  if (value === null || value === undefined) return null;
  if (value === "NULL") return null;
  return value.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
}

function splitSqlRow(rowText) {
  const values = [];
  let current = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < rowText.length; i += 1) {
    const char = rowText[i];

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
  const matches = [];
  const pattern = new RegExp(
    String.raw`INSERT INTO \`${tableName}\` \(([^)]+)\) VALUES\s*([\s\S]*?);`,
    "g",
  );

  let match;
  while ((match = pattern.exec(sql)) !== null) {
    matches.push({
      columns: match[1].split(",").map((column) => column.trim().replace(/`/g, "")),
      values: match[2],
    });
  }

  return matches;
}

function extractRowsFromInsertBlock(block) {
  const rows = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < block.length; i += 1) {
    const char = block[i];

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

function readLegacySqlDump(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const unitTypeBlocks = extractInsertBlock(sql, "unit_types");
  const unitBlocks = extractInsertBlock(sql, "units");

  const unitTypes = new Map();
  for (const block of unitTypeBlocks) {
    const rows = extractRowsFromInsertBlock(block.values);
    for (const row of rows) {
      const record = Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null]));
      if (record.id != null) {
        unitTypes.set(String(record.id), record);
      }
    }
  }

  const rows = [];
  for (const block of unitBlocks) {
    const parsedRows = extractRowsFromInsertBlock(block.values);
    for (const row of parsedRows) {
      const record = Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null]));
      const legacyUnitType = record.unit_type_id != null ? unitTypes.get(String(record.unit_type_id)) : null;
      rows.push({
        legacy_id: record.id,
        building_id: record.building_id,
        building_legacy_id: record.building_id,
        unit_number: record.unit_number,
        unit_type_id: record.unit_type_id,
        unit_type_name: legacyUnitType?.name ?? null,
        unit_type_code: legacyUnitType?.name ?? null,
        floor: record.floor,
        unit_percentage: record.unit_percentage,
        filename: record.filename,
        has_meter: record.has_meter,
        bill_adjustment: record.bill_adjustment,
        comments: record.comments,
      });
    }
  }

  return rows;
}

function compareUnitRows(a, b) {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  return a.canonicalUnitNumber.localeCompare(b.canonicalUnitNumber, "en", { numeric: true });
}

async function resolveCanonicalBuilding(supabase, buildingId, legacyRows) {
  if (buildingId) {
    const { data, error } = await supabase
      .from("tb810_buildings")
      .select("id, name")
      .eq("id", buildingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Canonical building could not be resolved.");
    return data;
  }

  const legacyBuildingIds = [...new Set(legacyRows.map((row) => String(row.building_id ?? "")).filter(Boolean))];
  if (legacyBuildingIds.length === 0) {
    throw new Error("No legacy building references were found in the SQL dump.");
  }

  const { data, error } = await supabase.from("tb810_buildings").select("id, name").order("name", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Canonical building could not be resolved.");
  return data;
}

async function seedUnitTypes(supabase) {
  const { error } = await supabase.from("tb810_unit_types").upsert(
    canonicalUnitTypeSeeds.map((seed) => ({
      id: canonicalUnitTypeIds[seed.code],
      code: seed.code,
      name: seed.name,
      sort_order: seed.sort_order,
      legacy_table: "units_import",
      legacy_id: `unit_type_${seed.code}`,
      legacy_metadata: { seed: true, source: "units_migration" },
    })),
    { onConflict: "code" },
  );
  if (error) throw new Error(error.message);
}

async function fetchExistingUnits(supabase, buildingId) {
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, building_id, unit_number, legacy_id, legacy_table")
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function summarizePrototypeCleanup(existingUnits, importedLegacyIds) {
  return existingUnits
    .filter((unit) => unit.legacy_table !== "units" || !unit.legacy_id || !importedLegacyIds.has(String(unit.legacy_id)))
    .map((unit) => ({
      unitId: unit.id,
      unitNumber: unit.unit_number,
      legacyId: unit.legacy_id ?? null,
      legacyTable: unit.legacy_table ?? null,
      reason: unit.legacy_table !== "units"
        ? "Not imported from the legacy `units` table."
        : "Legacy id is not present in the current SQL dump import set.",
    }));
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const args = parseArgs(process.argv.slice(2));
  if (!args.source) {
    throw new Error("Usage: node scripts/import-units.js --source <legacy-sql-dump.sql> [--building-id <uuid>] [--dry-run]");
  }

  const sourcePath = path.resolve(process.cwd(), args.source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source SQL dump not found: ${sourcePath}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sourceRows = readLegacySqlDump(sourcePath);
  const participationScale = detectParticipationScale(sourceRows);
  const sourceBuildingId = sourceRows.find((row) => row.building_id != null)?.building_id ?? null;
  const building = await resolveCanonicalBuilding(supabase, args.buildingId, sourceRows);
  if (!args.dryRun) {
    await seedUnitTypes(supabase);
  }

  const normalized = [];
  const warnings = [];
  const missingLegacyIds = [];
  const invalidParticipationPercentages = [];
  const duplicateUnitNumbers = [];
  const unknownUnitTypes = [];
  const missingBuildingReferences = [];
  const seenUnitNumbers = new Set();

  for (const [index, row] of sourceRows.entries()) {
    const normalizedRow = normalizeUnitImportRow(row, index, participationScale.scale);
    if ("error" in normalizedRow) {
      warnings.push(normalizedRow.error);
      if (normalizedRow.error.startsWith("Missing legacy id")) {
        missingLegacyIds.push(String(row.unit_number ?? `row-${index + 1}`));
      }
      if (normalizedRow.error.startsWith("Invalid participation percentage")) {
        invalidParticipationPercentages.push(String(row.unit_number ?? `row-${index + 1}`));
      }
      if (normalizedRow.error.startsWith("Unknown unit type")) {
        unknownUnitTypes.push(String(row.unit_number ?? `row-${index + 1}`));
      }
      continue;
    }

    if (row.building_id == null || String(row.building_id) === "") {
      missingBuildingReferences.push(normalizedRow.unitNumber);
      warnings.push(`Unit ${normalizedRow.unitNumber} is missing a legacy building reference.`);
      continue;
    }

    if (sourceBuildingId != null && String(row.building_id) !== String(sourceBuildingId)) {
      missingBuildingReferences.push(normalizedRow.unitNumber);
      warnings.push(`Unit ${normalizedRow.unitNumber} references a different legacy building.`);
      continue;
    }

    if (seenUnitNumbers.has(normalizedRow.canonicalUnitNumber)) {
      duplicateUnitNumbers.push(normalizedRow.canonicalUnitNumber);
      warnings.push(`Duplicate unit number in source: ${normalizedRow.canonicalUnitNumber}`);
      continue;
    }

    seenUnitNumbers.add(normalizedRow.canonicalUnitNumber);
    normalized.push(normalizedRow);
  }

  normalized.sort(compareUnitRows);

  const existingUnits = await fetchExistingUnits(supabase, building.id);
  const existingByUnitNumber = new Map(existingUnits.map((unit) => [unit.unit_number, unit]));
  const importedLegacyIds = new Set(normalized.map((row) => row.legacyId));

  const rowsToImport = [];
  const skippedRows = [];

  for (const row of normalized) {
    const existing = existingByUnitNumber.get(row.canonicalUnitNumber);
    const payload = {
      building_id: building.id,
      unit_type_id: canonicalUnitTypeIds[row.unitTypeCode] ?? null,
      unit_number: row.canonicalUnitNumber,
      floor: row.floor,
      display_name: row.displayName,
      display_order: row.displayOrder,
      registered_area_m2: row.registeredAreaM2,
      participation_percentage: row.participationPercentage,
      has_meter: row.hasMeter,
      notes: row.sourceRow.comments?.trim() || null,
      legacy_table: "units",
      legacy_id: row.legacyId,
      legacy_metadata: row.legacyMetadata,
    };

    if (!payload.unit_type_id) {
      warnings.push(`Unable to resolve unit type for ${row.canonicalUnitNumber}`);
      continue;
    }

    if (existing) {
      skippedRows.push(row.canonicalUnitNumber);
    }

    rowsToImport.push(payload);
  }

  const prototypeCleanupCandidates = summarizePrototypeCleanup(existingUnits, importedLegacyIds);

  if (!args.dryRun && rowsToImport.length > 0) {
    const { error } = await supabase.from("tb810_units").upsert(rowsToImport, {
      onConflict: "building_id,unit_number",
    });
    if (error) throw new Error(error.message);
  }

  const report = buildUnitImportReport({
    sourceFile: sourcePath,
    detectedParticipationScale: participationScale,
    totalSourceRows: sourceRows.length,
    totalImportedRows: normalized.length,
    totalSkippedRows: skippedRows.length,
    warnings,
    missingLegacyIds,
    invalidParticipationPercentages,
    unknownUnitTypes,
    duplicateUnitNumbers,
    missingBuildingReferences,
    prototypeCleanupCandidates,
  });

  console.log(
    JSON.stringify(
      {
        building: building.name,
        dryRun: args.dryRun,
        report,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
