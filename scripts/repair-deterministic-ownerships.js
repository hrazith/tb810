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
    if (!process.env[key]) process.env[key] = value;
  }
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
    if (depth >= 1) current += char;
  }

  return rows;
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function parseLegacySource(sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const parseTable = (tableName) => {
    const blocks = extractInsertBlock(sql, tableName);
    const rows = [];
    for (const block of blocks) {
      for (const row of extractRowsFromInsertBlock(block.values)) {
        rows.push(Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null])));
      }
    }
    return rows;
  };

  const owners = parseTable("owners");
  const units = parseTable("units");
  const ownerUnit = parseTable("owner_unit");

  const ownersById = new Map(owners.map((row) => [String(row.id), row]));
  const unitsById = new Map(units.map((row) => [String(row.id), row]));

  const grouped = new Map();
  for (const row of ownerUnit) {
    const key = String(row.unit_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const deterministic = [];
  const ambiguousLegacyUnitIds = new Set();
  for (const [legacyUnitId, rows] of grouped.entries()) {
    if (rows.length !== 1) {
      ambiguousLegacyUnitIds.add(legacyUnitId);
      continue;
    }
    const rel = rows[0];
    const legacyUnit = unitsById.get(String(rel.unit_id));
    const legacyOwner = ownersById.get(String(rel.owner_id));
    if (!legacyUnit || !legacyOwner) continue;
    deterministic.push({
      legacy_owner_unit_id: String(rel.id),
      legacy_owner_id: String(rel.owner_id),
      legacy_owner_code: normalizeText(legacyOwner.code),
      legacy_owner_name: normalizeText(legacyOwner.name),
      legacy_unit_id: String(rel.unit_id),
      legacy_unit_number: String(legacyUnit.unit_number),
      legacy_unit_type_id: String(legacyUnit.unit_type_id),
      bill: rel.bill == null ? null : String(rel.bill),
      unit_type_id: Number(legacyUnit.unit_type_id),
    });
  }

  return { deterministic, ambiguousLegacyUnitIds };
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

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const sqlPath = path.resolve(process.cwd(), DEFAULT_SQL_DUMP);
  if (!fs.existsSync(sqlPath)) throw new Error(`Source SQL dump not found: ${sqlPath}`);

  const { deterministic, ambiguousLegacyUnitIds } = parseLegacySource(sqlPath);
  const building = await resolveCanonicalBuilding(supabase);

  const { data: tb810Units, error: unitsError } = await supabase
    .from("tb810_units")
    .select("id, unit_number, unit_type_id, building_id")
    .eq("building_id", building.id);
  if (unitsError) throw new Error(unitsError.message);

  const { data: unitTypes, error: unitTypesError } = await supabase
    .from("tb810_unit_types")
    .select("id, code");
  if (unitTypesError) throw new Error(unitTypesError.message);
  const unitTypeCodeById = new Map((unitTypes ?? []).map((row) => [row.id, row.code]));

  const { data: owners, error: ownersError } = await supabase
    .from("tb810_owners")
    .select("id, full_name, owner_reference, legacy_owner_code, active")
    .not("legacy_owner_code", "is", null);
  if (ownersError) throw new Error(ownersError.message);
  const ownerByLegacyCode = new Map(
    (owners ?? []).map((row) => [normalizeText(row.legacy_owner_code), row]),
  );

  const unitByKey = new Map();
  for (const unit of tb810Units ?? []) {
    const code = unitTypeCodeById.get(unit.unit_type_id);
    unitByKey.set(normalizeText(unit.unit_number), unit);
    if (code === "parking") unitByKey.set(`EST-${normalizeText(unit.unit_number)}`, unit);
    if (code === "storage") unitByKey.set(`DEPOS-${normalizeText(unit.unit_number)}`, unit);
  }

  const candidateRows = deterministic
    .filter((row) => !ambiguousLegacyUnitIds.has(row.legacy_unit_id))
    .map((row) => {
      const owner = ownerByLegacyCode.get(row.legacy_owner_code);
      if (!owner) return { ...row, owner: null, unit: null };
      const unitKey =
        row.unit_type_id === 1
          ? row.legacy_unit_number
          : row.unit_type_id === 2
            ? `EST-${row.legacy_unit_number}`
            : `DEPOS-${row.legacy_unit_number}`;
      const unit = unitByKey.get(unitKey) ?? null;
      return { ...row, owner, unit };
    });

  const matched = candidateRows.filter((row) => row.owner && row.unit);
  const candidateUnitIds = [...new Set(matched.map((row) => row.unit.id))];
  if (candidateUnitIds.length !== matched.length) {
    throw new Error("Duplicate modern unit_id detected in candidate set.");
  }

  const { data: existingOwnerships, error: existingError } = await supabase
    .from("tb810_ownerships")
    .select("id, owner_id, unit_id, start_date, end_date, legacy_table, legacy_id, legacy_metadata")
    .in("unit_id", candidateUnitIds);
  if (existingError) throw new Error(existingError.message);

  const byUnit = new Map();
  for (const row of existingOwnerships ?? []) {
    if (!byUnit.has(row.unit_id)) byUnit.set(row.unit_id, []);
    byUnit.get(row.unit_id).push(row);
  }

  const safeRows = [];
  const failures = [];
  for (const row of matched) {
    const existing = byUnit.get(row.unit.id) ?? [];
    const open = existing.find((item) => item.end_date == null);
    if (open && open.owner_id !== row.owner.id) {
      failures.push({
        reason: "Open ownership already exists with different owner",
        legacy_unit_id: row.legacy_unit_id,
        legacy_unit_number: row.legacy_unit_number,
        modern_unit_id: row.unit.id,
        existing_owner_id: open.owner_id,
        proposed_owner_id: row.owner.id,
      });
      continue;
    }
    if (open && open.owner_id === row.owner.id) {
      continue;
    }

    safeRows.push({
      owner_id: row.owner.id,
      unit_id: row.unit.id,
      start_date: TB810_EFFECTIVE_FROM,
      end_date: null,
      notes: null,
      legacy_table: LEGACY_TABLE,
      legacy_id: row.legacy_owner_unit_id,
      legacy_metadata: {
        source_file: SOURCE_FILE,
        legacy_owner_unit_id: row.legacy_owner_unit_id,
        legacy_owner_id: row.legacy_owner_id,
        legacy_owner_code: row.legacy_owner_code,
        legacy_owner_name: row.legacy_owner_name,
        legacy_unit_id: row.legacy_unit_id,
        legacy_unit_number: row.legacy_unit_number,
        legacy_unit_type_id: row.legacy_unit_type_id,
        owner_unit_bill: row.bill,
        tb810_effective_from: TB810_EFFECTIVE_FROM,
      },
    });
  }

  const expectedCount = 100;
  if (safeRows.length !== expectedCount) {
    throw new Error(`Expected exactly ${expectedCount} repair candidates, found ${safeRows.length}.`);
  }

  if (failures.length > 0) {
    throw new Error(`Safety check failed: ${JSON.stringify(failures, null, 2)}`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tb810_ownerships")
    .insert(safeRows)
    .select("id, unit_id, owner_id, start_date, end_date, legacy_table, legacy_id");
  if (insertError) throw new Error(insertError.message);

  const { data: postOwnerships, error: postError } = await supabase
    .from("tb810_ownerships")
    .select("id, owner_id, unit_id, end_date")
    .in("unit_id", candidateUnitIds);
  if (postError) throw new Error(postError.message);

  const postOpen = (postOwnerships ?? []).filter((row) => row.end_date == null);
  if (postOpen.length !== candidateUnitIds.length) {
    throw new Error(`Post-repair verification failed: expected ${candidateUnitIds.length} open ownerships, found ${postOpen.length}.`);
  }

  console.log(JSON.stringify({
    inserted_rows: inserted?.length ?? 0,
    inserted_units: inserted?.map((row) => row.unit_id) ?? [],
    skipped_existing_open_rows: 0,
    deferred_ambiguous_units: [...ambiguousLegacyUnitIds],
    note: "Approved deterministic ownership repair completed.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error, null, 2));
  process.exit(1);
});
