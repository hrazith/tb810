import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_SQL_DUMP = path.resolve(process.cwd(), "legacy/sql/torrebal_admincondo.sql");
const SOURCE_FILE = path.basename(DEFAULT_SQL_DUMP);
const BUILDING_NAME = "TB810";
const TB810_EFFECTIVE_FROM = "2026-08-01";
const LEGACY_TABLE = "owner_unit";

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
  return {
    source: DEFAULT_SQL_DUMP,
    write: argv.includes("--write"),
  };
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
  const pattern = new RegExp(
    String.raw`INSERT INTO \`${tableName}\` \(([^)]+)\) VALUES\s*([\s\S]*?);`,
    "g",
  );
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

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function parseLegacyOwnershipSource(sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");

  const ownerBlocks = extractInsertBlock(sql, "owners");
  const unitBlocks = extractInsertBlock(sql, "units");
  const ownershipBlocks = extractInsertBlock(sql, "owner_unit");

  const owners = new Map();
  for (const block of ownerBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(
        block.columns.map((column, index) => [column, row[index] ?? null]),
      );
      if (record.id == null) continue;
      owners.set(String(record.id), record);
    }
  }

  const units = new Map();
  for (const block of unitBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(
        block.columns.map((column, index) => [column, row[index] ?? null]),
      );
      if (record.id == null) continue;
      units.set(String(record.id), record);
    }
  }

  const ownershipRows = [];
  for (const block of ownershipBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(
        block.columns.map((column, index) => [column, row[index] ?? null]),
      );
      if (record.id == null) continue;
      const owner = owners.get(String(record.owner_id)) ?? null;
      const unit = units.get(String(record.unit_id)) ?? null;
      ownershipRows.push({
        legacy_owner_unit_id: String(record.id),
        legacy_owner_id: record.owner_id == null ? null : String(record.owner_id),
        legacy_owner_code: normalizeText(owner?.code),
        legacy_owner_name: normalizeText(owner?.name),
        owner_active: owner?.active == null ? null : String(owner.active) === "1",
        legacy_unit_id: record.unit_id == null ? null : String(record.unit_id),
        legacy_unit_number: unit?.unit_number == null ? null : String(unit.unit_number),
        bill: record.bill == null ? null : String(record.bill),
      });
    }
  }

  return { owners, units, ownershipRows };
}

async function resolveCanonicalBuilding(supabase) {
  const { data, error } = await supabase
    .from("tb810_buildings")
    .select("id, name")
    .eq("name", BUILDING_NAME)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Canonical building could not be resolved.");
  return data;
}

async function getTB810OwnersByLegacyCode(supabase) {
  const { data, error } = await supabase
    .from("tb810_owners")
    .select("id, full_name, legacy_owner_code, active")
    .not("legacy_owner_code", "is", null);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [normalizeText(row.legacy_owner_code), row]));
}

async function getTB810UnitsForBuilding(supabase, buildingId) {
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, building_id")
    .eq("building_id", buildingId);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [normalizeText(row.unit_number), row]));
}

function buildMetadata(row) {
  return {
    legacy_owner_unit_id: row.legacy_owner_unit_id,
    legacy_owner_id: row.legacy_owner_id,
    legacy_owner_code: row.legacy_owner_code,
    legacy_unit_id: row.legacy_unit_id,
    legacy_unit_number: row.legacy_unit_number,
    owner_active: row.owner_active,
    bill: row.bill,
    source_file: SOURCE_FILE,
    actual_ownership_start_unknown: true,
    tb810_effective_from: TB810_EFFECTIVE_FROM,
  };
}

function toImportRecord(row, tb810OwnerId, tb810UnitId) {
  return {
    owner_id: tb810OwnerId,
    unit_id: tb810UnitId,
    start_date: TB810_EFFECTIVE_FROM,
    end_date: null,
    notes: null,
    legacy_table: LEGACY_TABLE,
    legacy_id: row.legacy_owner_unit_id,
    legacy_metadata: buildMetadata(row),
  };
}

async function getExistingOwnershipState(supabase, unitIds) {
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select("id, owner_id, unit_id, start_date, end_date, legacy_table, legacy_id, legacy_metadata")
    .in("unit_id", unitIds);

  if (error) throw new Error(error.message);
  return data ?? [];
}

function summarizeByUnit(rows) {
  const byUnitId = new Map();
  for (const row of rows) {
    const key = row.legacy_unit_id;
    if (!byUnitId.has(key)) byUnitId.set(key, []);
    byUnitId.get(key).push(row);
  }
  return byUnitId;
}

function sameLegacyOwnership(existing, row) {
  return (
    existing.legacy_table === LEGACY_TABLE &&
    normalizeText(existing.legacy_id) === row.legacy_owner_unit_id
  );
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
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const sqlPath = path.resolve(process.cwd(), args.source);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Source SQL dump not found: ${sqlPath}`);
  }

  const { ownershipRows } = parseLegacyOwnershipSource(sqlPath);
  const building = await resolveCanonicalBuilding(supabase);

  const legacyOwnerRows = new Map();
  const legacyUnitRows = new Map();
  const ownershipsByLegacyUnitId = summarizeByUnit(ownershipRows);

  for (const row of ownershipRows) {
    legacyOwnerRows.set(row.legacy_owner_id, row);
    legacyUnitRows.set(row.legacy_unit_id, row);
  }

  const tb810OwnersByCode = await getTB810OwnersByLegacyCode(supabase);
  const tb810UnitsByNumber = await getTB810UnitsForBuilding(supabase, building.id);
  const existingOwnerships = await getExistingOwnershipState(
    supabase,
    [...tb810UnitsByNumber.values()].map((row) => row.id),
  );

  const ambiguousLegacyUnitIds = new Set();
  for (const [legacyUnitId, rows] of ownershipsByLegacyUnitId.entries()) {
    if (rows.length !== 1) ambiguousLegacyUnitIds.add(legacyUnitId);
  }

  const matched = [];
  const unmatchedOwners = [];
  const unmatchedUnits = [];
  const ambiguousUnits = [];
  const idempotentMatches = [];
  const existingConflicts = [];

  for (const row of ownershipRows) {
    const legacyOwner = row.legacy_owner_code ? tb810OwnersByCode.get(row.legacy_owner_code) : null;
    const legacyUnit = row.legacy_unit_number ? tb810UnitsByNumber.get(normalizeText(row.legacy_unit_number)) : null;

    if (!legacyOwner) {
      if (!unmatchedOwners.some((item) => item.legacy_owner_code === row.legacy_owner_code)) {
        unmatchedOwners.push({
          legacy_owner_code: row.legacy_owner_code || null,
          legacy_owner_id: row.legacy_owner_id,
          legacy_owner_name: row.legacy_owner_name,
        });
      }
    }

    if (!legacyUnit) {
      if (!unmatchedUnits.some((item) => item.legacy_unit_number === row.legacy_unit_number)) {
        unmatchedUnits.push({
          legacy_unit_id: row.legacy_unit_id,
          legacy_unit_number: row.legacy_unit_number,
        });
      }
    }

    if (ambiguousLegacyUnitIds.has(row.legacy_unit_id)) {
      if (!ambiguousUnits.some((item) => item.legacy_unit_id === row.legacy_unit_id)) {
        ambiguousUnits.push({
          legacy_unit_id: row.legacy_unit_id,
          legacy_unit_number: row.legacy_unit_number,
          candidates: ownershipsByLegacyUnitId.get(row.legacy_unit_id) ?? [],
        });
      }
      continue;
    }

    if (!legacyOwner || !legacyUnit) {
      continue;
    }

    const existingForUnit = existingOwnerships.filter(
      (existing) => existing.unit_id === legacyUnit.id,
    );
    const identical = existingForUnit.find((existing) => sameLegacyOwnership(existing, row));
    if (identical) {
      idempotentMatches.push({
        tb810_ownership_id: identical.id,
        legacy_owner_unit_id: row.legacy_owner_unit_id,
        legacy_unit_number: row.legacy_unit_number,
      });
      continue;
    }

    const openConflict = existingForUnit.find((existing) => existing.end_date == null);
    if (openConflict) {
      existingConflicts.push({
        legacy_owner_unit_id: row.legacy_owner_unit_id,
        legacy_unit_number: row.legacy_unit_number,
        existing_ownership_id: openConflict.id,
        existing_owner_id: openConflict.owner_id,
        existing_start_date: openConflict.start_date,
      });
      continue;
    }

    matched.push({
      row,
      legacyOwner,
      legacyUnit,
      payload: toImportRecord(row, legacyOwner.id, legacyUnit.id),
    });
  }

  const proposedInserts = matched.length;
  const sourceRelationships = ownershipRows.length;
  const distinctLegacyUnits = new Set(ownershipRows.map((row) => row.legacy_unit_id)).size;
  const unambiguousUnits = distinctLegacyUnits - ambiguousUnits.length;

  const summary = {
    target_project: url,
    source_relationships: sourceRelationships,
    distinct_legacy_units: distinctLegacyUnits,
    unambiguous_units: unambiguousUnits,
    ambiguous_units: ambiguousUnits.length,
    matched_owners: [...new Set(matched.map((item) => item.row.legacy_owner_code))].length,
    unmatched_owner_codes: [...new Set(unmatchedOwners.map((item) => item.legacy_owner_code).filter(Boolean))],
    matched_units: [...new Set(matched.map((item) => item.row.legacy_unit_number))].length,
    unmatched_unit_numbers: [...new Set(unmatchedUnits.map((item) => item.legacy_unit_number).filter(Boolean))],
    proposed_inserts: proposedInserts,
    existing_idempotent_matches: idempotentMatches.length,
    existing_tb810_conflicts: existingConflicts.length,
    writesOwnershipData: true,
  };

  const proposedInsertTable = matched
    .map((item) => ({
      unit_number: item.row.legacy_unit_number,
      legacy_unit_id: item.row.legacy_unit_id,
      owner_code: item.row.legacy_owner_code,
      owner_name: item.row.legacy_owner_name,
      tb810_owner_uuid: item.legacyOwner.id,
      tb810_unit_uuid: item.legacyUnit.id,
    }))
    .sort((a, b) =>
      String(a.unit_number ?? "").localeCompare(String(b.unit_number ?? ""), "en", {
        numeric: true,
      }),
    );

  console.log("=== Dry Run Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("=== Proposed Inserts ===");
  console.table(proposedInsertTable);
  console.log("=== Ambiguous Units ===");
  console.log(JSON.stringify(ambiguousUnits, null, 2));
  console.log("=== Unmatched Owners ===");
  console.log(JSON.stringify(unmatchedOwners, null, 2));
  console.log("=== Unmatched Units ===");
  console.log(JSON.stringify(unmatchedUnits, null, 2));
  console.log("=== Existing Conflicts ===");
  console.log(JSON.stringify(existingConflicts, null, 2));
  console.log("=== Dry Run Totals ===");
  console.log(
    JSON.stringify(
      {
        total_proposed_inserts: proposedInserts,
        total_ambiguous_units_skipped: ambiguousUnits.length,
        total_unmatched_owner_codes: [...new Set(unmatchedOwners.map((item) => item.legacy_owner_code).filter(Boolean))].length,
        total_unmatched_unit_numbers: [...new Set(unmatchedUnits.map((item) => item.legacy_unit_number).filter(Boolean))].length,
        total_existing_ownership_conflicts: existingConflicts.length,
      },
      null,
      2,
    ),
  );

  if (!args.write) {
    console.log("Dry run only. Re-run with --write to insert unambiguous current ownerships.");
    return;
  }

  const unitsToCheck = [...new Set(matched.map((item) => item.legacyUnit.id))];
  const latestExisting = await getExistingOwnershipState(supabase, unitsToCheck);
  const safeRows = [];
  for (const item of matched) {
    const existingForUnit = latestExisting.filter((row) => row.unit_id === item.legacyUnit.id);
    const identical = existingForUnit.find((existing) => sameLegacyOwnership(existing, item.row));
    if (identical) continue;
    if (existingForUnit.some((existing) => existing.end_date == null)) {
      existingConflicts.push({
        legacy_owner_unit_id: item.row.legacy_owner_unit_id,
        legacy_unit_number: item.row.legacy_unit_number,
        reason: "Open ownership appeared during recheck",
      });
      continue;
    }
    safeRows.push(item.payload);
  }

  if (safeRows.length === 0) {
    console.log("No safe ownership rows to insert.");
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tb810_ownerships")
    .insert(safeRows)
    .select("id, unit_id, owner_id, start_date, end_date, legacy_table, legacy_id");

  if (insertError) throw insertError;

  console.log(JSON.stringify({
    inserted_rows: inserted?.length ?? 0,
    inserted_units: inserted?.map((row) => row.unit_id) ?? [],
    note: "TB810 pages will reflect the new ownerships on next render.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error, null, 2));
  process.exit(1);
});
