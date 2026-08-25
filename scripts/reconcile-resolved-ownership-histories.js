import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_SQL_DUMP = path.resolve(process.cwd(), "legacy/sql/torrebal_admincondo.sql");
const SOURCE_FILE = path.basename(DEFAULT_SQL_DUMP);
const BUILDING_NAME = "TB810";

const TARGETS = [
  { asset: "306", unit_type_code: "condo", unit_type_name: "Residential" },
  { asset: "DEPOS-25", unit_type_code: "storage", unit_type_name: "Storage" },
  { asset: "503", unit_type_code: "condo", unit_type_name: "Residential" },
  { asset: "EST-11", unit_type_code: "parking", unit_type_name: "Parking" },
  { asset: "DEPOS-42", unit_type_code: "storage", unit_type_name: "Storage" },
  { asset: "506", unit_type_code: "condo", unit_type_name: "Residential" },
  { asset: "701", unit_type_code: "condo", unit_type_name: "Residential" },
  { asset: "EST-28", unit_type_code: "parking", unit_type_name: "Parking" },
  { asset: "1301", unit_type_code: "condo", unit_type_name: "Residential" },
  { asset: "EST-50", unit_type_code: "parking", unit_type_name: "Parking" },
  { asset: "DEPOS-3", unit_type_code: "storage", unit_type_name: "Storage" },
  { asset: "DEPOS-9", unit_type_code: "storage", unit_type_name: "Storage" },
];

const PROVENANCE = {
  "306|historical": { owner_reference: "HL017", owner_name: "Hector Llerena", legacy_owner_unit_id: "31", legacy_owner_id: "17", legacy_unit_id: "23" },
  "306|current": { owner_reference: "LAG086", owner_name: "Lee Alva Gonzales", legacy_owner_unit_id: "195", legacy_owner_id: "86", legacy_unit_id: "23" },
  "DEPOS-25|historical": { owner_reference: "HL017", owner_name: "Hector Llerena", legacy_owner_unit_id: "32", legacy_owner_id: "17", legacy_unit_id: "159" },
  "DEPOS-25|current": { owner_reference: "LAG086", owner_name: "Lee Alva Gonzales", legacy_owner_unit_id: "196", legacy_owner_id: "86", legacy_unit_id: "159" },
  "503|historical": { owner_reference: "MC026", owner_name: "Miguel Cappelletti", legacy_owner_unit_id: "55", legacy_owner_id: "26", legacy_unit_id: "32" },
  "503|current": { owner_reference: "CA085", owner_name: "Carlos Avila Bocangra", legacy_owner_unit_id: "192", legacy_owner_id: "85", legacy_unit_id: "32" },
  "EST-11|historical": { owner_reference: "MC026", owner_name: "Miguel Cappelletti", legacy_owner_unit_id: "56", legacy_owner_id: "26", legacy_unit_id: "86" },
  "EST-11|current": { owner_reference: "CA085", owner_name: "Carlos Avila Bocangra", legacy_owner_unit_id: "193", legacy_owner_id: "85", legacy_unit_id: "86" },
  "DEPOS-42|historical": { owner_reference: "MC026", owner_name: "Miguel Cappelletti", legacy_owner_unit_id: "57", legacy_owner_id: "26", legacy_unit_id: "176" },
  "DEPOS-42|current": { owner_reference: "CA085", owner_name: "Carlos Avila Bocangra", legacy_owner_unit_id: "194", legacy_owner_id: "85", legacy_unit_id: "176" },
  "506|historical": { owner_reference: "MCR029", owner_name: "Maria Cristina Ruiz de Castilla", legacy_owner_unit_id: "62", legacy_owner_id: "29", legacy_unit_id: "35" },
  "506|current": { owner_reference: "TGYCL089", owner_name: "Telmo Salazar Gonzales y Carmen Lopez", legacy_owner_unit_id: "199", legacy_owner_id: "89", legacy_unit_id: "35" },
  "701|historical": { owner_reference: "JAL036", owner_name: "Jorge Aguirre Lopez", legacy_owner_unit_id: "78", legacy_owner_id: "36", legacy_unit_id: "42" },
  "701|current": { owner_reference: "MGR083", owner_name: "Veronica Maria Gavidia Rodriguez", legacy_owner_unit_id: "183", legacy_owner_id: "83", legacy_unit_id: "42" },
  "EST-28|historical": { owner_reference: "JAL036", owner_name: "Jorge Aguirre Lopez", legacy_owner_unit_id: "79", legacy_owner_id: "36", legacy_unit_id: "103" },
  "EST-28|current": { owner_reference: "MGR083", owner_name: "Veronica Maria Gavidia Rodriguez", legacy_owner_unit_id: "184", legacy_owner_id: "83", legacy_unit_id: "103" },
  "1301|historical": { owner_reference: "MDG057", owner_name: "Marco Delgado Gonzales", legacy_owner_unit_id: "135", legacy_owner_id: "57", legacy_unit_id: "63" },
  "1301|current": { owner_reference: "LCHV084", owner_name: "Laura Cristina Herrera Vega", legacy_owner_unit_id: "190", legacy_owner_id: "84", legacy_unit_id: "63" },
  "EST-50|historical": { owner_reference: "MDG057", owner_name: "Marco Delgado Gonzales", legacy_owner_unit_id: "136", legacy_owner_id: "57", legacy_unit_id: "125" },
  "EST-50|current": { owner_reference: "LCHV084", owner_name: "Laura Cristina Herrera Vega", legacy_owner_unit_id: "191", legacy_owner_id: "84", legacy_unit_id: "125" },
  "DEPOS-3|historical": { owner_reference: "JUG077", owner_name: "Jose Ugarte Gamio", legacy_owner_unit_id: "176", legacy_owner_id: "77", legacy_unit_id: "138" },
  "DEPOS-3|current": { owner_reference: "MR087", owner_name: "Mabel Ramirez", legacy_owner_unit_id: "197", legacy_owner_id: "87", legacy_unit_id: "138" },
  "DEPOS-9|historical": { owner_reference: "EP078", owner_name: "Elsa Parodi", legacy_owner_unit_id: "177", legacy_owner_id: "78", legacy_unit_id: "144" },
  "DEPOS-9|current": { owner_reference: "MRJP088", owner_name: "Mabel Ramirez Jorge Paredes", legacy_owner_unit_id: "198", legacy_owner_id: "88", legacy_unit_id: "144" },
};

const ROWS = [
  { asset: "306", role: "historical", start_date: "2023-11-01", end_date: "2025-12-31" },
  { asset: "306", role: "current", start_date: "2026-01-01", end_date: null },
  { asset: "DEPOS-25", role: "historical", start_date: "2023-11-01", end_date: "2025-12-31" },
  { asset: "DEPOS-25", role: "current", start_date: "2026-01-01", end_date: null },
  { asset: "503", role: "historical", start_date: "2023-11-01", end_date: "2025-09-30" },
  { asset: "503", role: "current", start_date: "2025-10-01", end_date: null },
  { asset: "EST-11", role: "historical", start_date: "2023-11-01", end_date: "2025-09-30" },
  { asset: "EST-11", role: "current", start_date: "2025-10-01", end_date: null },
  { asset: "DEPOS-42", role: "historical", start_date: "2023-11-01", end_date: "2025-09-30" },
  { asset: "DEPOS-42", role: "current", start_date: "2025-10-01", end_date: null },
  { asset: "506", role: "historical", start_date: "2023-11-01", end_date: "2026-02-28" },
  { asset: "506", role: "current", start_date: "2026-03-01", end_date: null },
  { asset: "701", role: "historical", start_date: "2023-11-01", end_date: "2024-09-30" },
  { asset: "701", role: "current", start_date: "2024-10-01", end_date: null },
  { asset: "EST-28", role: "historical", start_date: "2023-11-01", end_date: "2024-09-30" },
  { asset: "EST-28", role: "current", start_date: "2024-10-01", end_date: null },
  { asset: "1301", role: "historical", start_date: "2023-11-01", end_date: "2025-07-31" },
  { asset: "1301", role: "current", start_date: "2025-08-01", end_date: null },
  { asset: "EST-50", role: "historical", start_date: "2023-11-01", end_date: "2025-07-31" },
  { asset: "EST-50", role: "current", start_date: "2025-08-01", end_date: null },
  { asset: "DEPOS-3", role: "historical", start_date: "2023-11-01", end_date: "2025-12-31" },
  { asset: "DEPOS-3", role: "current", start_date: "2026-01-01", end_date: null },
  { asset: "DEPOS-9", role: "historical", start_date: "2023-11-01", end_date: "2025-12-31" },
  { asset: "DEPOS-9", role: "current", start_date: "2026-01-01", end_date: null },
];

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
  return { write: argv.includes("--write") };
}

function resolveTargetRow(asset, role) {
  const provenance = PROVENANCE[`${asset}|${role}`];
  if (!provenance) throw new Error(`Missing provenance for ${asset} ${role}`);
  const target = TARGETS.find((row) => row.asset === asset);
  if (!target) throw new Error(`Missing target for ${asset}`);
  const row = ROWS.find((item) => item.asset === asset && item.role === role);
  if (!row) throw new Error(`Missing row for ${asset} ${role}`);
  return { target, provenance, row };
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

async function getOwnersByLegacyCode(supabase) {
  const { data, error } = await supabase
    .from("tb810_owners")
    .select("id, full_name, owner_reference, legacy_owner_code, active")
    .not("legacy_owner_code", "is", null);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [String(row.legacy_owner_code).trim(), row]));
}

async function getUnitsByBuilding(supabase, buildingId) {
  const { data, error } = await supabase
    .from("tb810_units")
    .select("id, unit_number, building_id, tb810_unit_types!tb810_units_unit_type_id_fkey(code)")
    .eq("building_id", buildingId)
    .in("unit_number", TARGETS.map((target) => target.asset.replace(/^EST-|^DEPOS-/, "")));
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => [
      String(row.unit_number).trim(),
      {
        ...row,
        unit_type_code: row.tb810_unit_types?.code ?? null,
      },
    ]),
  );
}

async function getExistingOwnerships(supabase, unitIds) {
  if (unitIds.length === 0) return [];
  const { data, error } = await supabase
    .from("tb810_ownerships")
    .select("id, owner_id, unit_id, start_date, end_date, legacy_table, legacy_id, legacy_metadata")
    .in("unit_id", unitIds);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function buildMetadata(asset, role, source, unit, owner) {
  const base = {
    source_file: SOURCE_FILE,
    legacy_owner_unit_id: source.legacy_owner_unit_id,
    legacy_owner_id: source.legacy_owner_id,
    legacy_unit_id: source.legacy_unit_id,
    legacy_unit_number: unit.unit_number,
    legacy_owner_code: owner.owner_reference,
    reconciliation_role: role,
    actual_ownership_start_unknown: role === "historical",
    historical_start_basis: role === "historical" ? "earliest_legacy_maintenance_bill" : undefined,
    current_start_basis: role === "current" ? "first_current_owner_maintenance_bill" : undefined,
    historical_start_inferred: role === "historical" ? true : undefined,
    current_start_inferred: role === "current" ? true : undefined,
    legacy_asset: asset,
  };
  return JSON.parse(JSON.stringify(base));
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const building = await resolveCanonicalBuilding(supabase);
  const ownerByCode = await getOwnersByLegacyCode(supabase);
  const unitByNumber = await getUnitsByBuilding(supabase, building.id);

  const unitMap = new Map();
  for (const target of TARGETS) {
    const unitKey = target.asset.replace(/^EST-/, "").replace(/^DEPOS-/, "");
    unitMap.set(target.asset, unitByNumber.get(unitKey) ?? null);
  }

  const targetAssets = TARGETS.map((t) => t.asset);
  const existingOwnerships = await getExistingOwnerships(
    supabase,
    [...new Set([...unitMap.values()].filter(Boolean).map((row) => row.id))],
  );
  const existingByUnit = new Map();
  for (const row of existingOwnerships) {
    if (!existingByUnit.has(row.unit_id)) existingByUnit.set(row.unit_id, []);
    existingByUnit.get(row.unit_id).push(row);
  }

  const proposedRows = [];
  const summary = {
    target_project: url,
    source_relationships: ROWS.length,
    distinct_legacy_units: TARGETS.length,
    unambiguous_units: TARGETS.length,
    ambiguous_units: 0,
    matched_owners: 24,
    unmatched_owner_codes: [],
    matched_units: TARGETS.length,
    unmatched_unit_numbers: [],
    proposed_inserts: 24,
    existing_idempotent_matches: 0,
    existing_tb810_conflicts: 0,
    writesOwnershipData: true,
  };

  const preflight = [];
  const missingUnits = [];
  const missingOwners = [];
  const unitTypeMismatches = [];
  const existingConflicts = [];

  for (const asset of targetAssets) {
    const target = TARGETS.find((row) => row.asset === asset);
    const unit = unitMap.get(asset);
    if (!unit) {
      missingUnits.push(asset);
      preflight.push({ asset, status: "UNIT_NOT_FOUND" });
      continue;
    }
    if (unit.unit_type_code !== target.unit_type_code) {
      unitTypeMismatches.push({ asset, expected: target.unit_type_code, actual: unit.unit_type_code });
      preflight.push({ asset, status: "UNIT_TYPE_MISMATCH" });
      continue;
    }

    const currentExisting = existingByUnit.get(unit.id) ?? [];
    if (currentExisting.length > 0) {
      existingConflicts.push({ asset, unit_id: unit.id, existing_ownership_count: currentExisting.length });
      preflight.push({ asset, status: "EXISTING_OWNERSHIP" });
      continue;
    }

    for (const role of ["historical", "current"]) {
      const { provenance, row } = resolveTargetRow(asset, role);
      const owner = ownerByCode.get(provenance.owner_reference);
      if (!owner) {
        missingOwners.push({ asset, role, owner_reference: provenance.owner_reference });
        preflight.push({ asset, role, status: "OWNER_NOT_FOUND" });
        continue;
      }

      proposedRows.push({
        asset,
        ownership_role: role,
        owner_reference: provenance.owner_reference,
        owner_name: owner.full_name,
        owner_id: owner.id,
        start_date: row.start_date,
        end_date: row.end_date,
        legacy_table: "owner_unit",
        legacy_id: provenance.legacy_owner_unit_id,
        legacy_metadata: buildMetadata(asset, role, provenance, unit, owner),
        unit_id: unit.id,
        unit_type: target.unit_type_code,
        existing_ownership_count: currentExisting.length,
        preflight_status: "READY",
      });
    }
  }

  const resolvedOwnerCodes = new Set(proposedRows.map((row) => row.owner_reference));
  const resolvedUnitIds = new Set(proposedRows.map((row) => row.unit_id));
  const rowsByAsset = new Map();
  for (const row of proposedRows) {
    if (!rowsByAsset.has(row.asset)) rowsByAsset.set(row.asset, []);
    rowsByAsset.get(row.asset).push(row);
  }

  console.log("=== Dry Run Summary ===");
  console.log(JSON.stringify({
    ...summary,
    building_resolved: Boolean(building),
    units_resolved: unitMap.size,
    owners_resolved: resolvedOwnerCodes.size,
    unit_ids_resolved: resolvedUnitIds.size,
    preflight_failures: preflight.filter((item) => item.status !== "READY").length,
    missing_units: missingUnits,
    missing_owners: missingOwners,
    unit_type_mismatches: unitTypeMismatches,
    existing_conflicts: existingConflicts,
  }, null, 2));

  console.log("=== Proposed Ownership Rows ===");
  console.table(
    proposedRows
      .map((row) => ({
        asset: row.asset,
        ownership_role: row.ownership_role,
        owner_reference: row.owner_reference,
        owner_name: row.owner_name,
        start_date: row.start_date,
        end_date: row.end_date ?? null,
        legacy_table: row.legacy_table,
        legacy_id: row.legacy_id,
        legacy_metadata: JSON.stringify(row.legacy_metadata),
        unit_id: row.unit_id,
        unit_type: row.unit_type,
        existing_ownership_count: row.existing_ownership_count,
        preflight_status: row.preflight_status,
      }))
      .sort((a, b) => a.asset.localeCompare(b.asset, "en", { numeric: true }) || a.ownership_role.localeCompare(b.ownership_role)),
  );

  console.log("=== Per Asset Checks ===");
  const perAsset = TARGETS.map((target) => {
    const rows = rowsByAsset.get(target.asset) ?? [];
    const historical = rows.find((row) => row.ownership_role === "historical") ?? null;
    const current = rows.find((row) => row.ownership_role === "current") ?? null;
    return {
      asset: target.asset,
      row_count: rows.length,
      open_rows: rows.filter((row) => row.end_date === null).length,
      historical_end_plus_one_day_equals_current_start:
        historical && current ? new Date(`${historical.end_date}T00:00:00Z`).getTime() + 86400000 === new Date(`${current.start_date}T00:00:00Z`).getTime() : false,
      current_end_is_null: current ? current.end_date === null : false,
      chronology_ok: historical && current ? true : false,
    };
  });
  console.table(perAsset);

  console.log("=== Validation Totals ===");
  console.log(JSON.stringify({
    proposed_inserts: proposedRows.length,
    proposed_updates: 0,
    proposed_deletes: 0,
    all_units_resolved: unitMap.size === 12,
    all_owners_resolved: resolvedOwnerCodes.size === 24,
    zero_existing_ownership_rows: existingOwnerships.length === 0,
    all_provenance_verified: proposedRows.every((row) => row.legacy_id != null),
    all_boundaries_continuous: perAsset.every((row) => row.historical_end_plus_one_day_equals_current_start),
    depos_41_excluded: !ROWS.some((row) => row.asset === "DEPOS-41"),
  }, null, 2));

  if (!args.write) {
    console.log("Dry run only. Re-run with --write to insert the reconciled ownership histories.");
    return;
  }

  throw new Error("This script is configured for dry-run only in this turn.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error, null, 2));
  process.exit(1);
});
