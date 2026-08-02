import fs from "node:fs";

export const LEGACY_TABLE = "utilities";
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

function extractInsertBlocks(sql, tableName) {
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

function roundToFour(value) {
  if (value == null) return null;
  return Number(Number(value).toFixed(4));
}

function monthStartIso(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function monthKeyFromDate(date) {
  return String(date).slice(0, 7);
}

function shiftMonth(monthKey, offset) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  const shifted = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + offset, 1));
  return shifted.toISOString().slice(0, 7);
}

function formatMonthLabel(monthKey) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function sameLegacyBill(existing, payload) {
  const normalize = (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value)
            .map(([key, nested]) => [key, normalize(nested)])
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : Array.isArray(value)
        ? value.map((nested) => normalize(nested))
        : value;

  return (
    existing.building_id === payload.building_id &&
    existing.utility_type_id === payload.utility_type_id &&
    existing.billing_period_id === payload.billing_period_id &&
    existing.supplier_id === payload.supplier_id &&
    existing.bill_date === payload.bill_date &&
    Number(existing.amount) === Number(payload.amount) &&
    Number(existing.previous_reading) === Number(payload.previous_reading) &&
    Number(existing.current_reading) === Number(payload.current_reading) &&
    Number(existing.total_consumption) === Number(payload.total_consumption) &&
    Number(existing.unit_cost) === Number(payload.unit_cost) &&
    existing.status === payload.status &&
    (existing.description ?? null) === (payload.description ?? null) &&
    (existing.notes ?? null) === (payload.notes ?? null) &&
    JSON.stringify(normalize(existing.legacy_metadata ?? {})) ===
      JSON.stringify(normalize(payload.legacy_metadata ?? {}))
  );
}

export function readHistoricalLegacyUtilityRows(sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const utilityBlocks = extractInsertBlocks(sql, "utilities");
  const maintenanceBlocks = extractInsertBlocks(sql, "maintenance_bills");

  const utilities = [];
  for (const block of utilityBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      utilities.push(Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null])));
    }
  }

  const maintenanceBills = [];
  for (const block of maintenanceBlocks) {
    for (const row of extractRowsFromInsertBlock(block.values)) {
      maintenanceBills.push(Object.fromEntries(block.columns.map((column, index) => [column, row[index] ?? null])));
    }
  }

  return {
    utilities,
    maintenanceBills,
  };
}

export function buildHistoricalUtilityBillImport({
  sourceRows,
  canonicalBuilding,
  canonicalUtilityTypeId,
  canonicalBillingPeriods,
  existingBills,
}) {
  const billingPeriodByMonth = new Map(
    canonicalBillingPeriods.map((period) => [
      `${period.period_year}-${String(period.period_month).padStart(2, "0")}`,
      period,
    ]),
  );

  const existingByLegacyKey = new Map(
    existingBills.map((bill) => [`${bill.legacy_table ?? ""}:${bill.legacy_id ?? ""}`, bill]),
  );

  const sourceMonthKeys = new Set();
  const sourceBilledMonthKeys = new Set();
  const sourceBuildingIds = new Set();
  const sourceLegacyIds = new Set();
  const duplicateLegacyIds = [];
  const duplicateByLegacyId = new Map();
  const rows = [];
  const conflicts = [];
  let totalWarnings = 0;

  for (const sourceRow of sourceRows) {
    const legacyId = String(sourceRow.id ?? "");
    const rowKey = legacyId;
    const seenRows = duplicateByLegacyId.get(rowKey) ?? [];
    seenRows.push(sourceRow);
    duplicateByLegacyId.set(rowKey, seenRows);
  }

  for (const [legacyId, duplicates] of duplicateByLegacyId.entries()) {
    if (duplicates.length > 1) {
      duplicateLegacyIds.push({
        legacy_id: legacyId,
        count: duplicates.length,
      });
      totalWarnings += 1;
    }
  }

  for (const sourceRow of sourceRows) {
    const legacyId = String(sourceRow.id ?? "");
    if (sourceLegacyIds.has(legacyId)) continue;
    sourceLegacyIds.add(legacyId);
    sourceBuildingIds.add(String(sourceRow.building_id ?? ""));

    const billDate = monthStartIso(sourceRow.reading_date);
    const billMonth = billDate ? monthKeyFromDate(billDate) : null;
    const billedMonth = monthStartIso(sourceRow.billed_month);
    const billedMonthKey = billedMonth ? monthKeyFromDate(billedMonth) : null;
    const serviceMonthKey = billMonth ? shiftMonth(billMonth, -1) : null;

    if (billMonth) sourceMonthKeys.add(billMonth);
    if (billedMonthKey) sourceBilledMonthKeys.add(billedMonthKey);

    const billingPeriod =
      (billMonth && billingPeriodByMonth.get(billMonth)) ||
      (billedMonthKey && billingPeriodByMonth.get(billedMonthKey)) ||
      null;

    if (!billingPeriod) {
      totalWarnings += 1;
    }

    const previousReading = toNumber(sourceRow.reading_initial) ?? 0;
    const currentReading = toNumber(sourceRow.reading_final) ?? 0;
    const totalConsumption = currentReading - previousReading;
    const unitCost = roundToFour((toNumber(sourceRow.invoice_amount) ?? 0) / (totalConsumption || 1));

    const payload = {
      building_id: canonicalBuilding.id,
      utility_type_id: canonicalUtilityTypeId,
      billing_period_id: billingPeriod?.id ?? null,
      supplier_id: null,
      bill_date: billDate,
      amount: toNumber(sourceRow.invoice_amount) ?? 0,
      description: null,
      attachment_document_id: null,
      status: "approved",
      notes: null,
      previous_reading: previousReading,
      current_reading: currentReading,
      total_consumption: totalConsumption,
      unit_cost: unitCost,
      legacy_table: LEGACY_TABLE,
      legacy_id: legacyId,
      legacy_metadata: {
        source_table: LEGACY_TABLE,
        source_id: legacyId,
        source_building_id: sourceRow.building_id == null ? null : Number(sourceRow.building_id),
        source_unit_type_id: sourceRow.unit_type_id == null ? null : Number(sourceRow.unit_type_id),
        source_reading_initial: toNumber(sourceRow.reading_initial),
        source_reading_final: toNumber(sourceRow.reading_final),
        source_reading_date: billDate,
        source_billed_month: billedMonth,
        source_consumption: toNumber(sourceRow.consumption),
        source_unit_of_measure: sourceRow.unit_of_measure,
        source_invoice_amount: toNumber(sourceRow.invoice_amount),
        source_unit_price: toNumber(sourceRow.unit_price),
        source_common_consumption: toNumber(sourceRow.common_consumption),
        source_processed: sourceRow.processed == null ? null : Number(sourceRow.processed),
        source_created_by: sourceRow.createdBy == null ? null : Number(sourceRow.createdBy),
        source_modified_by: sourceRow.modifiedBy == null ? null : Number(sourceRow.modifiedBy),
        source_created_at: sourceRow.created_at,
        source_updated_at: sourceRow.updated_at,
        source_deleted_at: sourceRow.deleted_at,
        service_month: serviceMonthKey,
        billed_month: billedMonthKey,
        month_label: billedMonthKey ? formatMonthLabel(billedMonthKey) : null,
      },
      created_by: null,
      updated_by: null,
    };

    const existing = existingByLegacyKey.get(`${LEGACY_TABLE}:${legacyId}`) ?? null;
    const classification = existing ? (sameLegacyBill(existing, payload) ? "exact_match" : "safe_update") : "insert";

    if (existing && !sameLegacyBill(existing, payload)) {
      conflicts.push({
        legacy_id: legacyId,
        existing_id: existing.id,
        reason: "Existing canonical bill differs from legacy import payload.",
      });
    }

    rows.push({
      sourceRow,
      payload,
      classification,
      existing,
    });
  }

  const importedMonths = [...sourceMonthKeys].sort();
  const billedMonths = [...sourceBilledMonthKeys].sort();

  return {
    summary: {
      sourceRowCount: sourceRows.length,
      legacyBuildingIds: [...sourceBuildingIds].sort(),
      importedMonthCount: importedMonths.length,
      billedMonthCount: billedMonths.length,
      rowClassifications: rows.reduce(
        (acc, row) => {
          acc[row.classification] += 1;
          return acc;
        },
        { insert: 0, safe_update: 0, exact_match: 0 },
      ),
      totalWarnings,
    },
    report: {
      source: {
        legacy_table: LEGACY_TABLE,
        row_count: sourceRows.length,
        source_building_ids: [...sourceBuildingIds].sort(),
        reading_months: importedMonths,
        billed_months: billedMonths,
        fields: [
          "id",
          "building_id",
          "unit_type_id",
          "reading_initial",
          "reading_final",
          "reading_date",
          "consumption",
          "unit_of_measure",
          "invoice_amount",
          "billed_month",
          "unit_price",
          "common_consumption",
          "processed",
          "createdBy",
          "modifiedBy",
          "created_at",
          "updated_at",
          "deleted_at",
        ],
      },
      target: {
        table: "public.tb810_utility_bills",
        building_id: canonicalBuilding.id,
        utility_type_id: canonicalUtilityTypeId,
      },
      validation: {
        duplicate_legacy_ids: duplicateLegacyIds,
        conflicts,
        warnings: totalWarnings,
      },
      import_plan: {
        insert_count: rows.filter((row) => row.classification === "insert").length,
        safe_update_count: rows.filter((row) => row.classification === "safe_update").length,
        exact_match_count: rows.filter((row) => row.classification === "exact_match").length,
        total_rows: rows.length,
      },
      rows,
    },
    rows,
  };
}
