import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const BUILDING_ID = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";
const WORKBOOK_PATH = path.resolve(process.cwd(), "legacy/data/gas/ConsumoDeGas-25-26-USAR.xlsx");
const REPORT_PATH = path.resolve(process.cwd(), "reports/tb810-historical-gas-bills-reconciliation.json");
const LEGACY_TABLE = "gas_spreadsheet";
const SHEET_NAME = "Consumo";
const BILL_START_ROW = 4;
const BILL_END_ROW = 113;
const AUGUST_CYCLE_START = "2026-06-30";
const MIGRATION_PROCESSED_AT = "2026-08-11T00:00:00.000Z";
const HISTORICAL_SUPPLIER_NAME = "Historical Gas Supplier — Pending Verification";

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

function getAttribute(source, attribute) {
  const match = source.match(new RegExp(`${attribute}="([^"]+)"`));
  return match?.[1] ?? null;
}

function parseSharedStrings(xml) {
  const entries = [];
  const pattern = /<si[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    entries.push(
      match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
    );
  }
  return entries;
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

function excelSerialToISO(serial) {
  const ms = (Number(serial) - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (value == null) return null;
  const text = String(value).trim();
  let match;
  if ((match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/))) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day > 12 && month <= 12) return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (month > 12 && day <= 12) return `${match[3]}-${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`;
    return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if ((match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\b/))) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day > 12 && month <= 12) return `20${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (month > 12 && day <= 12) return `20${match[3]}-${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`;
    return `20${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if ((match = text.match(/^(\d+(?:\.0+)?)\b/))) {
    return excelSerialToISO(match[1]);
  }
  return null;
}

function normalizeNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isWorkbookBillRow(rowNumber) {
  return rowNumber >= BILL_START_ROW && rowNumber <= BILL_END_ROW;
}

async function listAllExistingGasBills(supabase) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("tb810_gas_bills")
      .select("id, building_id, supplier_name, invoice_number, invoice_date, amount, notes, processed_at, legacy_table, legacy_id, legacy_metadata, created_at, updated_at")
      .eq("building_id", BUILDING_ID)
      .range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function makeWorkbookBillPayload(sourceRow) {
  return {
    building_id: BUILDING_ID,
    supplier_name: HISTORICAL_SUPPLIER_NAME,
    invoice_number: sourceRow.invoiceNumber,
    invoice_date: sourceRow.invoiceDate,
    amount: sourceRow.amount,
    notes: null,
    processed_at: sourceRow.isAugustCycle ? null : MIGRATION_PROCESSED_AT,
    legacy_table: LEGACY_TABLE,
    legacy_id: `Consumo:${sourceRow.rowNumber}`,
    legacy_metadata: {
      source_workbook: "ConsumoDeGas-25-26-USAR.xlsx",
      source_sheet: SHEET_NAME,
      source_row_number: sourceRow.rowNumber,
      source_invoice_date_raw: sourceRow.invoiceDateRaw,
      source_invoice_date: sourceRow.invoiceDate,
      source_invoice_number: sourceRow.invoiceNumber,
      source_amount: sourceRow.amount,
      source_amount_raw: sourceRow.amountRaw,
      source_status: sourceRow.statusRaw ?? null,
      source_extra_marker: sourceRow.extraMarkerRaw ?? null,
      source_kind: "supplier_bill",
      historical_cycle: sourceRow.isAugustCycle ? "august_2026_cycle" : "historically_consumed",
      historical_migration: true,
    },
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

  const workbookBills = rows
    .filter((row) => isWorkbookBillRow(row.rowNumber))
    .map((row) => {
      const invoiceNumber = row.cells.get(`B${row.rowNumber}`);
      const invoiceDateRaw = row.cells.get(`A${row.rowNumber}`);
      const amountRaw = row.cells.get(`C${row.rowNumber}`);
      const statusRaw = row.cells.get(`D${row.rowNumber}`);
      const extraMarkerRaw = row.cells.get(`E${row.rowNumber}`);
      const invoiceDate = normalizeDate(invoiceDateRaw);
      const amount = normalizeNumber(amountRaw);
      return {
        rowNumber: row.rowNumber,
        invoiceNumber: invoiceNumber?.trim() ?? null,
        invoiceDate,
        isAugustCycle: invoiceDate != null ? invoiceDate >= AUGUST_CYCLE_START : false,
        invoiceDateRaw,
        amount,
        amountRaw,
        statusRaw,
        extraMarkerRaw,
      };
    });

  const excludedMissingInvoice = workbookBills.filter((bill) => !bill.invoiceNumber).length;
  const canonicalBills = workbookBills.filter((bill) => bill.invoiceNumber && bill.invoiceDate && bill.amount != null);
  const canonicalBillCount = canonicalBills.length;
  const historicalProcessedCount = canonicalBills.filter((bill) => bill.invoiceDate < AUGUST_CYCLE_START).length;
  const augustBills = canonicalBills.filter((bill) => bill.invoiceDate >= AUGUST_CYCLE_START);
  const augustAvailableCount = augustBills.length;
  const augustAvailableAmount = augustBills.reduce((total, bill) => total + (bill.amount ?? 0), 0);

  const existingBills = await listAllExistingGasBills(supabase);

  const existingByInvoice = new Map((existingBills ?? []).map((bill) => [bill.invoice_number, bill]));
  const workbookByInvoice = new Map(canonicalBills.map((bill) => [bill.invoiceNumber, bill]));

  const exactDuplicates = [];
  const conflicts = [];
  const safeInserts = [];
  const workbookUpdates = [];
  const nonWorkbookExisting = [];

  for (const bill of canonicalBills) {
    const existing = existingByInvoice.get(bill.invoiceNumber);
    const payload = makeWorkbookBillPayload(bill);
    if (!existing) {
      safeInserts.push(payload);
      continue;
    }

    const sameFacts =
      existing.supplier_name === payload.supplier_name &&
      existing.invoice_number === payload.invoice_number &&
      existing.invoice_date === payload.invoice_date &&
      Number(existing.amount) === Number(payload.amount) &&
      existing.processed_at === payload.processed_at &&
      existing.legacy_table === payload.legacy_table &&
      existing.legacy_id === payload.legacy_id;

    if (sameFacts) {
      exactDuplicates.push({
        invoice_number: bill.invoiceNumber,
        existing_id: existing.id,
      });
      continue;
    }

    if (
      existing.invoice_number === bill.invoiceNumber &&
      existing.invoice_date === bill.invoiceDate &&
      Number(existing.amount) === Number(bill.amount) &&
      existing.supplier_name === HISTORICAL_SUPPLIER_NAME
    ) {
      workbookUpdates.push({
        id: existing.id,
        payload,
      });
      continue;
    }

    conflicts.push({
      invoice_number: bill.invoiceNumber,
      existing_id: existing.id,
      existing_invoice_date: existing.invoice_date,
      existing_amount: existing.amount,
      existing_supplier_name: existing.supplier_name,
      source_invoice_date: bill.invoiceDate,
      source_amount: bill.amount,
    });
  }

  for (const existing of existingBills ?? []) {
    if (workbookByInvoice.has(existing.invoice_number)) continue;
    nonWorkbookExisting.push(existing);
  }

  const report = {
    sourceRows: workbookBills.length,
    canonicalBills: canonicalBillCount,
    historicallyProcessed: historicalProcessedCount,
    augustAvailable: augustAvailableCount,
    ambiguous: 0,
    excludedMissingInvoice,
    existingExactDuplicates: exactDuplicates.length,
    conflicts: conflicts.length,
    safeInserts: safeInserts.length,
    nonWorkbookExistingBills: nonWorkbookExisting.map((bill) => ({
      id: bill.id,
      invoice_number: bill.invoice_number,
      invoice_date: bill.invoice_date,
      amount: bill.amount,
      processed_at: bill.processed_at,
      supplier_name: bill.supplier_name,
    })),
    augustEligibleInvoiceNumbers: augustBills.map((bill) => bill.invoiceNumber),
    augustEligibleAmount: augustAvailableAmount,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));

  if (
    report.canonicalBills !== 109 ||
    report.historicallyProcessed !== 103 ||
    report.augustAvailable !== 6 ||
    report.ambiguous !== 0 ||
    report.excludedMissingInvoice !== 1 ||
    report.augustEligibleAmount !== 2760 ||
    report.conflicts !== 0
  ) {
    throw new Error("Historical gas bill migration aborted: preflight failed.");
  }

  if (args.dryRun) {
    return;
  }

  if (safeInserts.length > 0) {
    const { error } = await supabase.from("tb810_gas_bills").insert(safeInserts);
    if (error) throw error;
  }

  for (const item of workbookUpdates) {
    const { error } = await supabase
      .from("tb810_gas_bills")
      .update(item.payload)
      .eq("id", item.id);
    if (error) throw error;
  }

  for (const bill of nonWorkbookExisting) {
    if (bill.processed_at) continue;
    const { error } = await supabase
      .from("tb810_gas_bills")
      .update({
        supplier_name: HISTORICAL_SUPPLIER_NAME,
        processed_at: MIGRATION_PROCESSED_AT,
        legacy_metadata: {
          ...(bill.legacy_metadata ?? {}),
          historical_migration: true,
          source_kind: "non_workbook_test_bill",
          excluded_from_gas_eligibility: true,
        },
      })
      .eq("id", bill.id);
    if (error) throw error;
  }

  const verifiedBills = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("tb810_gas_bills")
      .select("id, building_id, supplier_name, invoice_number, invoice_date, amount, notes, processed_at, legacy_table, legacy_id, legacy_metadata, created_at, updated_at")
      .eq("building_id", BUILDING_ID)
      .range(from, to);
    if (error) throw error;
    verifiedBills.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  const verifiedByInvoice = new Map(verifiedBills.map((bill) => [bill.invoice_number, bill]));
  const verifiedWorkbookBills = canonicalBills.filter((bill) => verifiedByInvoice.has(bill.invoiceNumber));
  const verifiedProcessed = verifiedWorkbookBills.filter((bill) => {
    const persisted = verifiedByInvoice.get(bill.invoiceNumber);
    return persisted?.processed_at != null;
  });
  const verifiedAugustBills = augustBills.filter((bill) => {
    const persisted = verifiedByInvoice.get(bill.invoiceNumber);
    return persisted?.processed_at == null;
  });
  const verifiedNonWorkbook = nonWorkbookExisting.filter((bill) => {
    const persisted = verifiedByInvoice.get(bill.invoice_number);
    return persisted?.processed_at != null;
  });

  const eligibleInvoiceNumbers = verifiedAugustBills.map((bill) => bill.invoiceNumber).sort();
  const expectedEligibleInvoiceNumbers = [
    "B001-00303049",
    "B002-00002747",
    "B002-00002754",
    "B002-00002761",
    "B002-00002767",
    "B002-00002771",
  ].sort();

  if (
    verifiedWorkbookBills.length !== 109 ||
    verifiedProcessed.length !== 103 ||
    verifiedAugustBills.length !== 6 ||
    JSON.stringify(eligibleInvoiceNumbers) !== JSON.stringify(expectedEligibleInvoiceNumbers) ||
    verifiedAugustAmount(verifiedAugustBills, verifiedByInvoice) !== 2760 ||
    verifiedNonWorkbook.length !== nonWorkbookExisting.length
  ) {
    throw new Error("Historical gas bill migration verification failed.");
  }

  console.log(
    JSON.stringify(
      {
        verifiedWorkbookBills: verifiedWorkbookBills.length,
        verifiedProcessed: verifiedProcessed.length,
        verifiedAugustBills: verifiedAugustBills.length,
        verifiedAugustEligibleInvoiceNumbers: eligibleInvoiceNumbers,
        verifiedAugustAmount: verifiedAugustAmount(verifiedAugustBills, verifiedByInvoice),
        nonWorkbookExistingBillsProcessed: verifiedNonWorkbook.length,
      },
      null,
      2,
    ),
  );
}

function verifiedAugustAmount(augustBills, verifiedByInvoice) {
  return augustBills.reduce((total, bill) => {
    const persisted = verifiedByInvoice.get(bill.invoiceNumber);
    return total + (persisted ? Number(persisted.amount) : 0);
  }, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
