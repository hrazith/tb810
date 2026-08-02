import fs from "node:fs";

export const LEGACY_TABLE = "meters";
export const LEGACY_BATCH_ID = "meters_historical";
export const COMMON_WATER_CODE = "common_water";

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

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKeyFromDate(date) {
  return String(date).slice(0, 7);
}

function formatMonthLabel(monthKey) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function nextMonthKey(monthKey) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  const next = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 7);
}

export function readHistoricalLegacyMeterRows(sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const meterBlocks = extractInsertBlock(sql, "meters");
  const unitBlocks = extractInsertBlock(sql, "units");
  const unitTypeBlocks = extractInsertBlock(sql, "unit_types");

  const unitTypes = new Map();
  for (const block of unitTypeBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      const record = Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null]));
      if (record.id != null) {
        unitTypes.set(String(record.id), record);
      }
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

export function buildHistoricalMeterReadingImport({
  sourceRows,
  canonicalUnits,
  canonicalReadings,
  utilityTypeId,
  buildingId,
}) {
  const canonicalUnitByNumber = new Map(
    canonicalUnits.map((unit) => [String(unit.unit_number), unit]),
  );

  const canonicalReadingsByKey = new Map(
    canonicalReadings.map((reading) => [`${reading.unit_id}:${reading.reading_date}`, reading]),
  );

  const groupedByUnitId = new Map();
  for (const row of sourceRows) {
    const key = String(row.unit_id);
    const current = groupedByUnitId.get(key) ?? [];
    current.push(row);
    groupedByUnitId.set(key, current);
  }

  const sourceMonths = new Set();
  const duplicateGroups = [];
  const unknownUnits = [];
  const invalidReadings = [];
  const arithmeticMismatches = [];
  const skippedRowDetails = [];
  const monthGroups = new Map();
  const eligibleRows = [];

  for (const [legacyUnitId, rows] of groupedByUnitId.entries()) {
    rows.sort((a, b) => String(a.reading_date).localeCompare(String(b.reading_date)) || Number(a.id) - Number(b.id));
    const legacyUnit = rows[0]?.unit ?? null;
    const unitNumber = String(legacyUnit?.unit_number ?? "");
    const unitTypeName = String(legacyUnit?.unit_type_name ?? "").toLowerCase();
    const isResidential = unitTypeName === "departamento";

    for (const row of rows) {
      sourceMonths.add(monthKeyFromDate(row.reading_date));
      if (!isResidential) continue;
      const unit = canonicalUnitByNumber.get(unitNumber);
      if (!unit) {
        unknownUnits.push({
          legacy_unit_id: legacyUnitId,
          unit_number: unitNumber,
          reading_date: row.reading_date,
          reason: "No canonical residential Unit found for legacy unit number.",
        });
        continue;
      }

      const readingEnd = toNumber(row.reading);
      if (readingEnd == null || readingEnd < 0) {
        invalidReadings.push({
          legacy_id: String(row.id),
          unit_number: unitNumber,
          reading_date: row.reading_date,
          reason: "Legacy reading is invalid.",
        });
        skippedRowDetails.push({
          legacy_id: String(row.id),
          unit_number: unitNumber,
          reading_date: row.reading_date,
          reason: "Invalid reading value.",
        });
        continue;
      }

      eligibleRows.push({
        sourceRow: row,
        unit,
        unitNumber,
        legacyUnitId,
        readingDate: row.reading_date,
        readingEnd,
        legacyMonthConsumed: row.month_consumed,
        legacyMonthConsumption: row.month_consumption,
      });

      const monthKey = monthKeyFromDate(row.reading_date);
      const monthGroupKey = `${unit.id}:${monthKey}`;
      const current = monthGroups.get(monthGroupKey) ?? [];
      current.push(row);
      monthGroups.set(monthGroupKey, current);
    }
  }

  for (const [groupKey, rows] of monthGroups.entries()) {
    if (rows.length > 1) {
      const [unitId, monthKey] = groupKey.split(":");
      duplicateGroups.push({
        unit_id: unitId,
        month_key: monthKey,
        source_legacy_ids: rows.map((row) => String(row.id)),
      });
    }
  }

  const rowsByUnit = new Map();
  for (const row of eligibleRows) {
    const unitRows = rowsByUnit.get(row.unit.id) ?? [];
    unitRows.push(row);
    rowsByUnit.set(row.unit.id, unitRows);
  }

  const mappedRows = [];
  const warnings = [];
  const sourceRowsByMonth = new Map();
  const sourceRowsByUnit = new Map();

  for (const [unitId, rows] of rowsByUnit.entries()) {
    rows.sort((a, b) => String(a.readingDate).localeCompare(String(b.readingDate)) || Number(a.sourceRow.id) - Number(b.sourceRow.id));
    let priorReadingEnd = null;

    for (const row of rows) {
      const readingDate = row.readingDate;
      const monthKey = monthKeyFromDate(readingDate);
      const readingStart = priorReadingEnd;
      const computedConsumption =
        readingStart == null ? null : Number((row.readingEnd - readingStart).toFixed(3));
      const sourceConsumption = toNumber(row.legacyMonthConsumption);

      let effectiveReadingStart = readingStart;
      let effectiveConsumption = computedConsumption;
      let resetDetected = false;

      if (readingStart != null && row.readingEnd < readingStart) {
        resetDetected = true;
        warnings.push(
          `Unit ${row.unitNumber} reading on ${readingDate} dropped below the prior reading; treating this row as a reset baseline and preserving the prior reading in provenance.`,
        );
        effectiveReadingStart = 0;
        effectiveConsumption = sourceConsumption ?? row.readingEnd;
      }

      if (
        sourceConsumption != null &&
        effectiveConsumption != null &&
        !resetDetected &&
        Math.abs(sourceConsumption - effectiveConsumption) > 0.001
      ) {
        arithmeticMismatches.push({
          legacy_id: String(row.sourceRow.id),
          unit_number: row.unitNumber,
          reading_date: readingDate,
          source_consumption: sourceConsumption,
          computed_consumption: effectiveConsumption,
        });
      }

      const legacyMetadata = {
        legacy_source: LEGACY_TABLE,
        legacy_batch_id: LEGACY_BATCH_ID,
        legacy_unit_id: row.legacyUnitId,
        legacy_unit_number: row.unitNumber,
        legacy_service_metered: row.sourceRow.service_metered,
        legacy_processed: row.sourceRow.processed,
        legacy_month_consumed: row.legacyMonthConsumed,
        legacy_month_consumption: row.legacyMonthConsumption,
        legacy_created_by: row.sourceRow.createdBy,
        legacy_modified_by: row.sourceRow.modifiedBy,
        legacy_created_at: row.sourceRow.created_at,
        legacy_updated_at: row.sourceRow.updated_at,
        legacy_prior_reading_end: readingStart,
        legacy_reset_detected: resetDetected,
        source_row: row.sourceRow,
      };

      const existing = canonicalReadingsByKey.get(`${row.unit.id}:${readingDate}`) ?? null;
      const canonicalRow = {
        building_id: buildingId,
        unit_id: row.unit.id,
        utility_type_id: utilityTypeId,
        reading_date: readingDate,
        reading_start: effectiveReadingStart,
        reading_end: row.readingEnd,
        consumption: effectiveConsumption,
        unit_of_measure: "m3",
        status: "recorded",
        notes: `Historical legacy import ${monthKey} (${row.unitNumber})`,
        legacy_table: LEGACY_TABLE,
        legacy_id: `${LEGACY_BATCH_ID}:${row.sourceRow.id}`,
        legacy_metadata: legacyMetadata,
        existing,
        month_key: monthKey,
        unit_number: row.unitNumber,
      };

      sourceRowsByMonth.set(monthKey, (sourceRowsByMonth.get(monthKey) ?? 0) + 1);
      sourceRowsByUnit.set(row.unitNumber, (sourceRowsByUnit.get(row.unitNumber) ?? 0) + 1);
      mappedRows.push(canonicalRow);
      priorReadingEnd = row.readingEnd;
    }
  }

  const canonicalByKey = new Map(mappedRows.map((row) => [`${row.unit_id}:${row.reading_date}`, row]));
  const insertedRows = mappedRows.filter((row) => !row.existing);
  const matchingRows = mappedRows.filter((row) => row.existing);
  const totalSourceRows = sourceRows.length;
  const residentialSourceRows = eligibleRows.length;
  const skippedRowCount = totalSourceRows - residentialSourceRows;
  const monthList = [...sourceMonths].sort();
  const monthGaps = [];
  for (let i = 1; i < monthList.length; i += 1) {
    const expectedNext = nextMonthKey(monthList[i - 1]);
    if (monthList[i] !== expectedNext) {
      monthGaps.push({ previous_month: monthList[i - 1], next_expected_month: expectedNext, actual_month: monthList[i] });
    }
  }

  const provenanceComplete = mappedRows.every((row) => {
    const md = row.legacy_metadata ?? {};
    return Boolean(
      row.legacy_table &&
        row.legacy_id &&
        md.source_row &&
        md.legacy_unit_id &&
        md.legacy_created_at,
    );
  });

  return {
    summary: {
      source_table: LEGACY_TABLE,
      legacy_rows_found: totalSourceRows,
      eligible_residential_rows: residentialSourceRows,
      imported_rows: mappedRows.length,
      inserted_rows: insertedRows.length,
      matching_existing_rows: matchingRows.length,
      updated_rows: 0,
      skipped_rows: skippedRowCount,
      unknown_units: unknownUnits.length,
      duplicate_source_unit_month_groups: duplicateGroups.length,
      invalid_readings: invalidReadings.length,
      arithmetic_consumption_mismatches: arithmeticMismatches.length,
      provenance_complete: provenanceComplete,
      month_gap_count: monthGaps.length,
      source_months: monthList,
    },
    report: {
      summary: {
        source_table: LEGACY_TABLE,
        source_months: monthList,
        source_month_range: monthList.length
          ? { first: monthList[0], last: monthList[monthList.length - 1] }
          : null,
      },
      rows_by_month: Object.fromEntries([...sourceRowsByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      rows_by_unit: Object.fromEntries([...sourceRowsByUnit.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }))),
      unknown_units: unknownUnits,
      duplicate_source_unit_month_groups: duplicateGroups,
      invalid_readings: invalidReadings,
      skipped_row_details: skippedRowDetails,
      arithmetic_consumption_mismatches: arithmeticMismatches,
      month_gaps: monthGaps,
      provenance_complete: provenanceComplete,
      warnings,
      rows: mappedRows.map((row) => ({
        unit_number: row.unit_number,
        unit_id: row.unit_id,
        reading_date: row.reading_date,
        reading_start: row.reading_start,
        reading_end: row.reading_end,
        consumption: row.consumption,
        existing: Boolean(row.existing),
        legacy_id: row.legacy_id,
      })),
      rows_to_import: insertedRows.map((row) => ({
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        reading_date: row.reading_date,
        reading_start: row.reading_start,
        reading_end: row.reading_end,
        consumption: row.consumption,
        legacy_id: row.legacy_id,
      })),
      rows_to_update: [],
      canonical_key_count: canonicalByKey.size,
    },
    mappedRows,
  };
}
