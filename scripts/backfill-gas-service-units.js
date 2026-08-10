import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const BUILDING_ID = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";
const APPROVED_UNIT_NUMBERS = [
  "201",
  "202",
  "203",
  "204",
  "205",
  "206",
  "302",
  "303",
  "304",
  "305",
  "306",
  "402",
  "403",
  "404",
  "405",
  "406",
  "501",
  "502",
  "503",
  "504",
  "505",
  "506",
  "601",
  "602",
  "603",
  "604",
  "605",
  "702",
  "703",
  "704",
  "801",
  "802",
  "804",
  "901",
  "902",
  "903",
  "1001",
  "1002",
  "1003",
  "1101",
  "1102",
  "1103",
  "1201",
  "1202",
  "1203",
  "1301",
  "1302",
  "1303",
  "1401",
  "1402",
  "1403",
  "1501",
  "1502",
  "1503",
  "1601",
  "1602",
  "1701",
  "1702",
];

const EXCLUDED_UNIT_NUMBER = "301";

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
  const args = {
    write: false,
    report: path.resolve(process.cwd(), "reports/tb810-gas-service-backfill.json"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--write") {
      args.write = true;
      continue;
    }
    if (value === "--report") {
      args.report = argv[++i] ?? args.report;
    }
  }

  return args;
}

function toUnitNumber(value) {
  return value == null ? "" : String(value).trim();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b));
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

  const [{ data: building, error: buildingError }, { data: unitTypes, error: unitTypesError }, { data: units, error: unitsError }] = await Promise.all([
    supabase.from("tb810_buildings").select("id, name").eq("id", BUILDING_ID).maybeSingle(),
    supabase.from("tb810_unit_types").select("id, code, name"),
    supabase.from("tb810_units").select("id, building_id, unit_type_id, unit_number, has_gas_service").eq("building_id", BUILDING_ID),
  ]);

  if (buildingError) throw buildingError;
  if (unitTypesError) throw unitTypesError;
  if (unitsError) throw unitsError;
  if (!building) throw new Error("Canonical building not found.");

  const condoType = (unitTypes ?? []).find((unitType) => unitType.code === "condo");
  if (!condoType) throw new Error("Condo unit type not found.");

  const typeById = new Map((unitTypes ?? []).map((unitType) => [unitType.id, unitType]));
  const condoUnits = (units ?? []).filter((unit) => typeById.get(unit.unit_type_id)?.code === "condo");
  const condoByNumber = new Map();
  for (const unit of condoUnits) {
    const key = toUnitNumber(unit.unit_number);
    const list = condoByNumber.get(key) ?? [];
    list.push(unit);
    condoByNumber.set(key, list);
  }

  const approvedPopulation = APPROVED_UNIT_NUMBERS;
  const resolvedCondos = [];
  const unresolved = [];
  const nonCondo = [];

  for (const unitNumber of approvedPopulation) {
    const matches = condoByNumber.get(unitNumber) ?? [];
    if (matches.length === 0) {
      const allMatches = (units ?? []).filter((unit) => toUnitNumber(unit.unit_number) === unitNumber);
      if (allMatches.length > 0) {
        nonCondo.push(unitNumber);
      } else {
        unresolved.push(unitNumber);
      }
      continue;
    }
    if (matches.length > 1) {
      unresolved.push(unitNumber);
      continue;
    }
    resolvedCondos.push(matches[0]);
  }

  const unit301Matches = (units ?? []).filter((unit) => toUnitNumber(unit.unit_number) === EXCLUDED_UNIT_NUMBER);
  const unit301CurrentState = unit301Matches.map((unit) => ({
    id: unit.id,
    unit_number: toUnitNumber(unit.unit_number),
    has_gas_service: unit.has_gas_service,
    unit_type: typeById.get(unit.unit_type_id)?.code ?? null,
  }));

  const alreadyEnabled = resolvedCondos.filter((unit) => unit.has_gas_service).map((unit) => toUnitNumber(unit.unit_number));
  const needsEnable = resolvedCondos.filter((unit) => !unit.has_gas_service).map((unit) => toUnitNumber(unit.unit_number));

  const report = {
    building_id: BUILDING_ID,
    building_name: building.name,
    approvedPopulation: approvedPopulation.length,
    resolvedCondos: resolvedCondos.length,
    alreadyEnabled: uniqueSorted(alreadyEnabled),
    needsEnable: uniqueSorted(needsEnable),
    unresolved: uniqueSorted(unresolved),
    nonCondo: uniqueSorted(nonCondo),
    unit301CurrentState,
    gasEnabledCondos: condoUnits.filter((unit) => unit.has_gas_service).length,
    gasEnabledUnitNumbers: uniqueSorted(condoUnits.filter((unit) => unit.has_gas_service).map((unit) => toUnitNumber(unit.unit_number))),
  };

  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));

  if (unresolved.length > 0 || nonCondo.length > 0) {
    throw new Error("Write refused: unresolved or non-condo approved Units were found.");
  }

  if (!args.write) {
    return;
  }

  const rowsAlreadyTrue = alreadyEnabled.length;
  let rowsChangedToTrue = 0;

  const approvedSet = new Set(APPROVED_UNIT_NUMBERS);
  const unit301Resolved = unit301Matches[0] ?? null;

  for (const unit of condoUnits) {
    const unitNumber = toUnitNumber(unit.unit_number);
    const shouldBeEnabled = approvedSet.has(unitNumber);
    const shouldBeDisabled = unitNumber === EXCLUDED_UNIT_NUMBER;
    const desired = shouldBeDisabled ? false : shouldBeEnabled ? true : unit.has_gas_service;
    if (unit.has_gas_service === desired) continue;

    const { error } = await supabase
      .from("tb810_units")
      .update({ has_gas_service: desired })
      .eq("id", unit.id)
      .eq("building_id", BUILDING_ID)
      .select("id, has_gas_service");
    if (error) throw error;

    if (!unit.has_gas_service && desired) {
      rowsChangedToTrue += 1;
    }
  }

  if (unit301Resolved) {
    const { error } = await supabase
      .from("tb810_units")
      .update({ has_gas_service: false })
      .eq("id", unit301Resolved.id)
      .eq("building_id", BUILDING_ID)
      .select("id, has_gas_service");
    if (error) throw error;
  }

  const { data: refreshedUnits, error: refreshError } = await supabase
    .from("tb810_units")
    .select("id, unit_type_id, unit_number, has_gas_service")
    .eq("building_id", BUILDING_ID);
  if (refreshError) throw refreshError;

  const refreshedCondoGasEnabled = (refreshedUnits ?? [])
    .filter((unit) => typeById.get(unit.unit_type_id)?.code === "condo" && unit.has_gas_service)
    .map((unit) => toUnitNumber(unit.unit_number));

  const postWrite = {
    gasEnabledCondos: refreshedCondoGasEnabled.length,
    gasEnabledUnitNumbers: uniqueSorted(refreshedCondoGasEnabled),
    unit301GasService: (refreshedUnits ?? []).find((unit) => toUnitNumber(unit.unit_number) === EXCLUDED_UNIT_NUMBER)?.has_gas_service ?? null,
    rowsChangedToTrue,
    rowsAlreadyTrue,
  };

  console.log(JSON.stringify(postWrite, null, 2));

  if (postWrite.gasEnabledCondos !== APPROVED_UNIT_NUMBERS.length || postWrite.unit301GasService !== false) {
    throw new Error(
      `Post-write verification failed: expected ${APPROVED_UNIT_NUMBERS.length} enabled condo Units and Unit 301 disabled, got ${postWrite.gasEnabledCondos} enabled and Unit 301=${String(postWrite.unit301GasService)}.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
