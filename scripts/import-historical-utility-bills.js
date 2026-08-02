import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  COMMON_WATER_CODE,
  buildHistoricalUtilityBillImport,
  readHistoricalLegacyUtilityRows,
} from "../server/import/water/historical-utility-bills.js";

const DEFAULT_SQL_DUMP = path.resolve(process.cwd(), "legacy/sql/torrebal_admincondo.sql");
const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/tb810-historical-utility-bills-reconciliation.json",
);

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

function monthKeyFromDate(date) {
  return String(date).slice(0, 7);
}

async function resolveCanonicalBuilding(supabase) {
  const { data, error } = await supabase
    .from("tb810_buildings")
    .select("id, name, created_at")
    .order("created_at", { ascending: true })
    .limit(2);

  if (error) throw error;
  if (!data || !data.length) {
    throw new Error("Canonical building not found.");
  }

  if (data.length > 1) {
    return {
      data: data[0],
      warning: `Multiple canonical buildings found (${data.length}); using the first building only.`,
    };
  }

  return { data: data[0], warning: null };
}

async function getCommonWaterUtilityType(supabase) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", COMMON_WATER_CODE)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Common Water utility type not found.");
  return data;
}

async function getSedapalSupplierId(supabase, buildingId) {
  const { data, error } = await supabase
    .from("tb810_suppliers")
    .select("id, name, building_id")
    .eq("building_id", buildingId)
    .or("name.ilike.%Sedapal%,name.ilike.%Sedapal Water%,name.ilike.%Sedapal - %")
    .limit(5);

  if (error) throw error;
  return data?.[0]?.id ?? null;
}

async function getCanonicalBillingPeriods(supabase, buildingId) {
  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select("id, period_year, period_month, starts_on, ends_on, status")
    .eq("building_id", buildingId)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getExistingUtilityBills(supabase, buildingId, utilityTypeId) {
  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .select(
      "id, building_id, utility_type_id, billing_period_id, supplier_id, bill_date, amount, description, attachment_document_id, status, notes, previous_reading, current_reading, total_consumption, unit_cost, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at",
    )
    .eq("building_id", buildingId)
    .eq("utility_type_id", utilityTypeId);

  if (error) throw error;
  return data ?? [];
}

function buildMissingBillingPeriods(sourceRows, canonicalBillingPeriods) {
  const billingPeriodByMonth = new Set(
    canonicalBillingPeriods.map((period) => `${period.period_year}-${String(period.period_month).padStart(2, "0")}`),
  );

  const billMonths = [...new Set(sourceRows.map((row) => monthKeyFromDate(row.reading_date)))].sort();
  return billMonths.filter((month) => !billingPeriodByMonth.has(month));
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadEnvFile(path.resolve(process.cwd(), ".env"));
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

  const legacy = readHistoricalLegacyUtilityRows(sqlPath);
  const utilityRows = legacy.utilities ?? [];

  const buildingResult = await resolveCanonicalBuilding(supabase);
  const building = buildingResult.data;
  const utilityType = await getCommonWaterUtilityType(supabase);
  const supplierId = await getSedapalSupplierId(supabase, building.id);
  const billingPeriods = await getCanonicalBillingPeriods(supabase, building.id);
  const existingBills = await getExistingUtilityBills(supabase, building.id, utilityType.id);

  const missingBillingPeriods = buildMissingBillingPeriods(utilityRows, billingPeriods);
  const result = buildHistoricalUtilityBillImport({
    sourceRows: utilityRows,
    canonicalBuilding: building,
    canonicalUtilityTypeId: utilityType.id,
    canonicalBillingPeriods: billingPeriods,
    existingBills,
  });

  const report = {
    ...result.report,
    source: {
      ...result.report.source,
      supplier_lookup: supplierId ? "sedapal supplier matched" : "supplier not found; leaving supplier_id null",
    },
    target: {
      ...result.report.target,
      supplier_id: supplierId,
      billing_period_coverage: {
        existing_months: billingPeriods.map((period) => `${period.period_year}-${String(period.period_month).padStart(2, "0")}`),
        missing_months: missingBillingPeriods,
      },
    },
    validation: {
      ...result.report.validation,
      missing_billing_periods: missingBillingPeriods,
    },
  };

  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);

  const summary = {
    sourceRowCount: result.summary.sourceRowCount,
    building: { id: building.id, name: building.name },
    utilityType: { id: utilityType.id, code: utilityType.code, name: utilityType.name },
    supplierId,
    insertCount: result.summary.rowClassifications.insert,
    safeUpdateCount: result.summary.rowClassifications.safe_update,
    exactMatchCount: result.summary.rowClassifications.exact_match,
    warningCount: report.validation.warnings + missingBillingPeriods.length + (buildingResult.warning ? 1 : 0),
    missingBillingPeriods,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (buildingResult.warning) {
    console.warn(buildingResult.warning);
  }

  if (missingBillingPeriods.length > 0) {
    throw new Error(`Missing canonical billing periods for months: ${missingBillingPeriods.join(", ")}`);
  }

  if (args.dryRun) {
    return;
  }

  const rowsToUpsert = result.rows.map((row) => ({
    ...row.payload,
    supplier_id: supplierId,
  }));

  const existingByLegacyKey = new Map(
    existingBills.map((bill) => [`${bill.legacy_table ?? ""}:${bill.legacy_id ?? ""}`, bill]),
  );

  const inserts = [];
  const updates = [];
  for (const row of result.rows) {
    const payload = { ...row.payload, supplier_id: supplierId };
    const existing = existingByLegacyKey.get(`${payload.legacy_table ?? ""}:${payload.legacy_id ?? ""}`);
    if (!existing) {
      inserts.push(payload);
      continue;
    }

    if (row.classification === "safe_update") {
      updates.push({ id: existing.id, row: payload });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("tb810_utility_bills").insert(inserts);
    if (error) throw error;
  }

  for (const item of updates) {
    const { error } = await supabase.from("tb810_utility_bills").update(item.row).eq("id", item.id);
    if (error) throw error;
  }

  console.log(
    `Imported utility bills: inserted ${inserts.length}, updated ${updates.length}, matched ${result.summary.rowClassifications.exact_match}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
