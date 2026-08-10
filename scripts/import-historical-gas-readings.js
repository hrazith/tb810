import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const BUILDING_ID = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";
const WORKBOOK_PATH = path.resolve(process.cwd(), "legacy/data/gas/ConsumoDeGas-25-26-USAR.xlsx");
const REPORT_PATH = path.resolve(process.cwd(), "reports/tb810-historical-gas-readings-reconciliation.json");
const LEGACY_TABLE = "gas_spreadsheet";
const SHEET_NAME = "Lecturas";
const START_MONTH = "2024-06";
const END_MONTH = "2026-08";
const FIRST_MONTH_INDEX = 2; // C
const LAST_MONTH_INDEX = 28; // AC
const EXCLUDED_UNIT_NUMBERS = new Set(["301"]);
const APPROVED_REPLACEMENTS = new Set([
  "2be2647e-dbbc-4fad-af37-316b0c562aaa:2026-07",
  "2be2647e-dbbc-4fad-af37-316b0c562aaa:2026-08",
  "c92cd897-bd32-407a-8efe-737dddd66e5a:2026-07",
]);
const QUARANTINED_MISSING_HISTORY = new Set([
  "306:2026-02",
  "306:2026-03",
  "306:2026-04",
  "306:2026-05",
  "306:2026-06",
  "306:2026-08",
  "804:2026-02",
  "804:2026-03",
  "804:2026-04",
  "804:2026-05",
  "804:2026-06",
  "804:2026-08",
]);

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
    dryRun: true,
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--write" || value === "--import") {
      args.write = true;
      args.dryRun = false;
      continue;
    }
    if (value === "--dry-run") {
      args.dryRun = true;
      args.write = false;
    }
  }

  return args;
}

function unzipEntry(zipPath, entry) {
  try {
    return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8", maxBuffer: 60 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function escapeXmlText(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSharedStrings(xml) {
  const entries = [];
  const pattern = /<si[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    entries.push(escapeXmlText(match[1]));
  }
  return entries;
}

function getAttribute(source, attribute) {
  const match = source.match(new RegExp(`${attribute}="([^"]+)"`));
  return match?.[1] ?? null;
}

function parseSheetXml(xml, sharedStrings) {
  const rows = [];
  const rowMatches = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  for (const rowXml of rowMatches) {
    const rowNumber = Number(getAttribute(rowXml, "r") ?? "0");
    const cellMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) ?? [];
    const cells = new Map();
    for (const cellXml of cellMatches) {
      const ref = getAttribute(cellXml, "r") ?? "";
      const type = getAttribute(cellXml, "t");
      const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
      const inlineMatch = cellXml.match(/<is>([\s\S]*?)<\/is>/);
      let value = null;
      if (type === "s" && valueMatch) value = sharedStrings[Number(valueMatch[1])] ?? null;
      else if (type === "inlineStr" && inlineMatch) value = inlineMatch[1].replace(/<[^>]+>/g, "");
      else if (valueMatch) value = valueMatch[1];
      cells.set(ref, value == null ? null : String(value).trim());
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function columnIndexToName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function monthKeyFromColumnIndex(index) {
  const monthsSinceStart = index - FIRST_MONTH_INDEX;
  const start = new Date(`${START_MONTH}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + monthsSinceStart);
  return start.toISOString().slice(0, 7);
}

function monthKeyToDate(monthKey) {
  return `${monthKey}-01`;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDecimal(value) {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return parsed.toFixed(3);
}

async function listAllExistingGasReadings(supabase) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("tb810_gas_readings")
      .select("id, building_id, unit_id, reading_month, reading_date, previous_reading, current_reading, consumption, legacy_table, legacy_id, legacy_metadata")
      .eq("building_id", BUILDING_ID)
      .range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeUnitNumber(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return text;
  return String(parsed).replace(/\.0+$/, "");
}

function readingKey(unitId, monthKey) {
  return `${unitId}:${monthKey}`;
}

function isCondoUnit(unitTypeCode) {
  return unitTypeCode === "condo";
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!fs.existsSync(WORKBOOK_PATH)) {
    throw new Error(`Workbook not found: ${WORKBOOK_PATH}`);
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workbookXml = unzipEntry(WORKBOOK_PATH, "xl/workbook.xml");
  const relsXml = unzipEntry(WORKBOOK_PATH, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = unzipEntry(WORKBOOK_PATH, "xl/sharedStrings.xml");
  if (!workbookXml || !relsXml) throw new Error("Unable to read workbook structure.");

  const relMap = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relMap.set(match[1], match[2]);
  }

  let sheetPath = null;
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    if (match[1] !== SHEET_NAME) continue;
    const target = relMap.get(match[2]);
    if (target) {
      sheetPath = `xl/${target}`;
      break;
    }
  }
  if (!sheetPath) {
    throw new Error(`Unable to locate ${SHEET_NAME} sheet.`);
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const sheetXml = unzipEntry(WORKBOOK_PATH, sheetPath);
  if (!sheetXml) throw new Error(`Unable to read workbook sheet: ${sheetPath}`);
  const rows = parseSheetXml(sheetXml, sharedStrings);

  const monthColumns = Array.from({ length: LAST_MONTH_INDEX - FIRST_MONTH_INDEX + 1 }, (_, offset) => {
    const columnIndex = FIRST_MONTH_INDEX + offset;
    return {
      column: columnIndexToName(columnIndex),
      monthKey: monthKeyFromColumnIndex(columnIndex),
    };
  });

  const { data: building, error: buildingError } = await supabase
    .from("tb810_buildings")
    .select("id, name")
    .eq("id", BUILDING_ID)
    .maybeSingle();
  if (buildingError) throw buildingError;
  if (!building) throw new Error("Canonical building not found.");

  const [{ data: unitTypes, error: unitTypesError }, { data: units, error: unitsError }] = await Promise.all([
    supabase.from("tb810_unit_types").select("id, code, name"),
    supabase
      .from("tb810_units")
      .select("id, building_id, unit_type_id, unit_number, has_gas_service")
      .eq("building_id", BUILDING_ID),
  ]);
  if (unitTypesError) throw unitTypesError;
  if (unitsError) throw unitsError;

  const unitTypeCodeById = new Map((unitTypes ?? []).map((unitType) => [unitType.id, unitType.code]));
  const canonicalUnits = (units ?? [])
    .map((unit) => ({
      ...unit,
      unit_type_code: unitTypeCodeById.get(unit.unit_type_id) ?? null,
    }))
    .filter((unit) => isCondoUnit(unit.unit_type_code) && unit.has_gas_service);

  const canonicalUnitByNumber = new Map(canonicalUnits.map((unit) => [String(unit.unit_number), unit]));

  const workbookRows = rows
    .filter((row) => row.rowNumber >= 4)
    .map((row) => {
      const unitNumber = normalizeUnitNumber(row.cells.get(`A${row.rowNumber}`));
      const meterIdentifier = normalizeText(row.cells.get(`B${row.rowNumber}`));
      return { row, unitNumber, meterIdentifier };
    })
    .filter(({ unitNumber }) => unitNumber);

  const readingsByKey = new Map();
  const excludedRows = [];
  const quarantinedMissingHistory = [];
  const unexpectedUnresolved = [];

  for (const { row, unitNumber, meterIdentifier } of workbookRows) {
    if (EXCLUDED_UNIT_NUMBERS.has(unitNumber)) {
      excludedRows.push({
        sourceRowNumber: row.rowNumber,
        unitNumber,
        meterIdentifier,
        reason: "Unit 301 is explicitly excluded from migration.",
      });
      continue;
    }

    const unit = canonicalUnitByNumber.get(unitNumber);
    if (!unit) {
      unexpectedUnresolved.push({
        sourceRowNumber: row.rowNumber,
        unitNumber,
        meterIdentifier,
        reason: "Workbook Unit did not resolve to a canonical gas-enabled condo Unit.",
      });
      continue;
    }

    for (const { column, monthKey } of monthColumns) {
      const currentRaw = normalizeText(row.cells.get(`${column}${row.rowNumber}`));
      if (!currentRaw && currentRaw !== "0") {
        const quarantinedKey = `${unitNumber}:${monthKey}`;
        if (QUARANTINED_MISSING_HISTORY.has(quarantinedKey)) {
          quarantinedMissingHistory.push({
            sourceRowNumber: row.rowNumber,
            unitNumber,
            meterIdentifier,
            monthKey,
            reason: `Missing workbook evidence quarantined for ${monthKey}.`,
          });
          continue;
        }
        unexpectedUnresolved.push({
          sourceRowNumber: row.rowNumber,
          unitNumber,
          meterIdentifier,
          monthKey,
          reason: `Missing cumulative reading in ${column}${row.rowNumber} for ${monthKey}.`,
        });
        continue;
      }

      const currentReading = toNumber(currentRaw);
      if (currentReading == null) {
        unresolvedRows.push({
          sourceRowNumber: row.rowNumber,
          unitNumber,
          reason: `Invalid cumulative reading in ${column}${row.rowNumber} for ${monthKey}.`,
        });
        continue;
      }

      const monthOffset = monthColumns.findIndex((item) => item.column === column);
      const previousMonth = monthOffset > 0 ? monthColumns[monthOffset - 1] : null;
      const previousRaw = previousMonth ? normalizeText(row.cells.get(`${previousMonth.column}${row.rowNumber}`)) : "";
      const previousReading = previousMonth ? toNumber(previousRaw) : null;
      const consumption = previousReading == null ? null : Math.max(currentReading - previousReading, 0);
      const isDecrease = previousReading != null && currentReading < previousReading;
      const anomaly = isDecrease
        ? {
            type: "decreasing_cumulative_reading",
            previous_month: previousMonth.monthKey,
            previous_reading: previousReading,
            current_month: monthKey,
            current_reading: currentReading,
            raw_difference: Number((currentReading - previousReading).toFixed(3)),
            workbook_consumption: 0,
          }
        : null;

      readingsByKey.set(readingKey(unit.id, monthKey), {
        building_id: BUILDING_ID,
        unit_id: unit.id,
        reading_month: monthKeyToDate(monthKey),
        reading_date: monthKeyToDate(monthKey),
        previous_reading: previousReading,
        current_reading: currentReading,
        consumption,
        notes: `Historical Gas reading import ${monthKey} (${unitNumber})`,
        legacy_table: LEGACY_TABLE,
        legacy_id: `Lecturas:${row.rowNumber}:${column}`,
        legacy_metadata: {
          source_workbook: "ConsumoDeGas-25-26-USAR.xlsx",
          source_sheet: SHEET_NAME,
          source_row_number: row.rowNumber,
          source_unit_number_cell: `A${row.rowNumber}`,
          source_meter_cell: `B${row.rowNumber}`,
          source_column: column,
          source_month: monthKey,
          source_unit_number: unitNumber,
          source_meter_identifier: meterIdentifier || null,
          source_unit_id: unit.id,
          source_current_reading_raw: currentRaw,
          source_current_reading: currentReading,
          source_previous_reading_raw: previousMonth ? previousRaw : null,
          source_previous_reading: previousReading,
          source_consumption: consumption,
          reading_date_source: "month_start_placeholder",
          is_historical_import: true,
          anomaly,
        },
      });
    }
  }

  const candidateRows = [...readingsByKey.values()];
  const canonicalCandidateCount = candidateRows.length;
  const expectedCandidateCount = canonicalUnits.length * monthColumns.length;

  const existingReadings = await listAllExistingGasReadings(supabase);

  const existingByKey = new Map(
    existingReadings.map((reading) => [readingKey(reading.unit_id, reading.reading_month.slice(0, 7)), reading]),
  );

  const safeInserts = [];
  const exactDuplicates = [];
  const approvedReplacementRows = [];
  const unexpectedConflicts = [];

  for (const row of candidateRows) {
    const key = readingKey(row.unit_id, row.reading_month.slice(0, 7));
    const existing = existingByKey.get(key) ?? null;
    if (!existing) {
      safeInserts.push(row);
      continue;
    }

    const sameHistoricalFacts =
      existing.reading_month === row.reading_month &&
      normalizeDecimal(existing.reading_date) === normalizeDecimal(row.reading_date) &&
      normalizeDecimal(existing.previous_reading) === normalizeDecimal(row.previous_reading) &&
      normalizeDecimal(existing.current_reading) === normalizeDecimal(row.current_reading) &&
      normalizeDecimal(existing.consumption) === normalizeDecimal(row.consumption);

    if (sameHistoricalFacts) {
      exactDuplicates.push({
        unit_id: row.unit_id,
        reading_month: row.reading_month,
        existing_id: existing.id,
        existing_current_reading: existing.current_reading,
        current_reading: row.current_reading,
      });
      continue;
    }

    if (APPROVED_REPLACEMENTS.has(key)) {
      approvedReplacementRows.push({
        unit_id: row.unit_id,
        reading_month: row.reading_month,
        existing_id: existing.id,
        existing_current_reading: existing.current_reading,
        source_current_reading: row.current_reading,
        existing_legacy_metadata: existing.legacy_metadata,
        source_legacy_metadata: row.legacy_metadata,
      });
      continue;
    }

    unexpectedConflicts.push({
      unit_id: row.unit_id,
      reading_month: row.reading_month,
      existing_id: existing.id,
      existing_current_reading: existing.current_reading,
      source_current_reading: row.current_reading,
      existing_legacy_metadata: existing.legacy_metadata,
      source_legacy_metadata: row.legacy_metadata,
    });
  }

  const sourcePopulation = canonicalUnits.length * monthColumns.length;
  const report = {
    workbook: path.basename(WORKBOOK_PATH),
    sheet: SHEET_NAME,
    building_id: BUILDING_ID,
    historical_range: { start: START_MONTH, end: END_MONTH },
    month_columns: monthColumns,
    canonical_units: canonicalUnits.length,
    sourcePopulation,
    candidate_rows: canonicalCandidateCount,
    expected_candidate_rows: expectedCandidateCount,
    excluded_unit_301_rows: excludedRows,
    quarantinedMissingHistory,
    unexpectedUnresolved,
    exact_duplicates: exactDuplicates,
    approvedReplacements: approvedReplacementRows,
    unexpectedConflicts,
    safe_inserts: safeInserts.length,
    anomaly_count: safeInserts.filter((row) => row.legacy_metadata?.anomaly).length,
    safe_insert_samples: safeInserts.slice(0, 5),
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      canonicalUnits: canonicalUnits.length,
      candidateRows: canonicalCandidateCount,
      safeInserts: safeInserts.length,
      exactDuplicates: exactDuplicates.length,
      approvedReplacements: approvedReplacementRows.length,
      quarantinedMissingHistory: quarantinedMissingHistory.length,
      excludedUnit301Rows: excludedRows.length,
      unexpectedConflicts: unexpectedConflicts.length,
      unexpectedUnresolved: unexpectedUnresolved.length,
      reportPath: REPORT_PATH,
    },
    null,
    2,
  ));

  if (
    canonicalUnits.length !== 58 ||
    sourcePopulation !== 1566 ||
    excludedRows.length !== 2 ||
    quarantinedMissingHistory.length !== 12 ||
    unexpectedConflicts.length > 0 ||
    unexpectedUnresolved.length > 0 ||
    canonicalCandidateCount === 0
  ) {
    throw new Error("Historical migration aborted: workbook reconciliation failed.");
  }

  if (args.dryRun || safeInserts.length === 0) {
    return;
  }

  const chunkSize = 100;
  for (let index = 0; index < safeInserts.length; index += chunkSize) {
    const chunk = safeInserts.slice(index, index + chunkSize);
    const { error } = await supabase.from("tb810_gas_readings").insert(chunk);
    if (error) throw error;
  }

  for (const row of approvedReplacementRows) {
    const payload = candidateRows.find(
      (candidate) => candidate.unit_id === row.unit_id && candidate.reading_month === row.reading_month,
    );
    if (!payload) {
      throw new Error(`Approved replacement payload missing for ${row.unit_id}:${row.reading_month}`);
    }
    const { error } = await supabase
      .from("tb810_gas_readings")
      .update({
        reading_month: payload.reading_month,
        reading_date: payload.reading_date,
        previous_reading: payload.previous_reading,
        current_reading: payload.current_reading,
        consumption: payload.consumption,
        legacy_table: payload.legacy_table,
        legacy_id: payload.legacy_id,
        legacy_metadata: payload.legacy_metadata,
      })
      .eq("id", row.existing_id);
    if (error) throw error;
  }

  const verifiedReadings = await listAllExistingGasReadings(supabase);
  const verifiedByKey = new Map(
    verifiedReadings.map((reading) => [readingKey(reading.unit_id, reading.reading_month.slice(0, 7)), reading]),
  );

  const verifiedSafeInserts = candidateRows.filter((row) => !verifiedByKey.has(readingKey(row.unit_id, row.reading_month.slice(0, 7))));
  const verifiedApprovedReplacements = approvedReplacementRows.filter((row) => {
    const persisted = verifiedByKey.get(readingKey(row.unit_id, row.reading_month.slice(0, 7))) ?? null;
    if (!persisted) return false;
    const payload = candidateRows.find(
      (candidate) => candidate.unit_id === row.unit_id && candidate.reading_month === row.reading_month,
    );
    if (!payload) return false;
    return (
      persisted.reading_month === payload.reading_month &&
      normalizeDecimal(persisted.reading_date) === normalizeDecimal(payload.reading_date) &&
      normalizeDecimal(persisted.previous_reading) === normalizeDecimal(payload.previous_reading) &&
      normalizeDecimal(persisted.current_reading) === normalizeDecimal(payload.current_reading) &&
      normalizeDecimal(persisted.consumption) === normalizeDecimal(payload.consumption)
    );
  });
  const verifiedUnexpectedConflicts = candidateRows.filter((row) => {
    const persisted = verifiedByKey.get(readingKey(row.unit_id, row.reading_month.slice(0, 7))) ?? null;
    if (!persisted) return false;
    const isApprovedReplacement = APPROVED_REPLACEMENTS.has(readingKey(row.unit_id, row.reading_month.slice(0, 7)));
    if (isApprovedReplacement) return false;
    return (
      persisted.reading_month !== row.reading_month ||
      normalizeDecimal(persisted.reading_date) !== normalizeDecimal(row.reading_date) ||
      normalizeDecimal(persisted.previous_reading) !== normalizeDecimal(row.previous_reading) ||
      normalizeDecimal(persisted.current_reading) !== normalizeDecimal(row.current_reading) ||
      normalizeDecimal(persisted.consumption) !== normalizeDecimal(row.consumption)
    );
  });

  if (
    verifiedSafeInserts.length !== 0 ||
    verifiedApprovedReplacements.length !== 3 ||
    verifiedUnexpectedConflicts.length !== 0 ||
    unexpectedUnresolved.length !== 0 ||
    canonicalUnits.length !== 58 ||
    sourcePopulation !== 1566 ||
    quarantinedMissingHistory.length !== 12 ||
    excludedRows.length !== 2
  ) {
    throw new Error("Historical migration verification failed.");
  }

  console.log("Historical gas readings migration verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
