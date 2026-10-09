import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd()) } });
const { groupHistoricalGasBills, isGasTestRecord } = jiti("./processed-groups.ts");
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const service = read("./index.ts");
const workspace = read("../../app/(staff)/gas/bills/_components/gas-bills-workspace.tsx");

let next = 0;
const bill = (date, amount, legacy_metadata = {}, overrides = {}) => ({
  id: `b${next++}`, invoice_date: date, amount, invoice_number: null, supplier_name: null, processed_at: "2026-08-11T00:00:00Z",
  reserved_billing_period_id: null, selected_obligation_month: null, legacy_metadata, status: "processed", ...overrides,
});
const consumo = (row, date, amount, marker = null) => bill(date, amount, { source_sheet: "Consumo", source_row_number: row, source_extra_marker: marker === null ? null : String(marker), historical_cycle: "historically_consumed" });

test("historical purchases are grouped only by recorded billing-group provenance", () => {
  const groups = groupHistoricalGasBills([
    bill("2026-08-05", 460, { historical_processing: { ledger_group: "05/08/26-31/08/26" } }),
    bill("2026-08-31", 460, { historical_processing: { ledger_group: "05/08/26-31/08/26" } }),
    bill("2026-06-30", 460, { historical_cycle: "august_2026_cycle" }),
    bill("2026-07-30", 460, { historical_cycle: "august_2026_cycle" }),
    consumo(4, "2024-05-21", 449),
    consumo(5, "2024-05-30", 898, 1347),
    // Same purchase date as row 5, but a different recorded group.
    consumo(6, "2024-05-30", 400),
    consumo(7, "2024-06-18", 500, 1200),
    consumo(8, "2025-08-04", 420),
    bill("2025-09-01", 300),
  ]);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
  assert.deepEqual(groups.map((g) => g.key), ["ledger:05/08/26-31/08/26", "cycle:august_2026_cycle", "unrecorded", "consumo:6-7", "consumo:4-5"]);
  assert.equal(byKey["ledger:05/08/26-31/08/26"].total, 920);
  assert.match(byKey["ledger:05/08/26-31/08/26"].detail, /Canonical supplier ledger group · consumed outside TB810/);
  assert.match(byKey["cycle:august_2026_cycle"].detail, /August 2026 cycle \(recorded at import\)/);
  assert.equal(byKey["consumo:4-5"].total, 1347);
  assert.equal(byKey["consumo:4-5"].ledgerTotal, null);
  // The sheet total (1200) differs from the purchases on record (900): shown, not hidden.
  assert.equal(byKey["consumo:6-7"].total, 900);
  assert.equal(byKey["consumo:6-7"].ledgerTotal, 1200);
  // Rows after the last recorded total and purchases without provenance: no invented month.
  assert.equal(byKey.unrecorded.label, "Billing group not recorded");
  assert.equal(byKey.unrecorded.bills.length, 2);
  assert.match(byKey.unrecorded.detail, /^Purchases dated Aug 4, 2025 – Sep 1, 2025 · consumed outside TB810$/);
  // Every purchase appears exactly once.
  assert.equal(groups.reduce((n, g) => n + g.bills.length, 0), 10);
});

test("the September test bill is recognised as a test record, real purchases are not", () => {
  assert.equal(isGasTestRecord({ invoice_number: "B002-TEST-SEP02" }), true);
  assert.equal(isGasTestRecord({ invoice_number: "B002-00002771" }), false);
  assert.equal(isGasTestRecord({ invoice_number: null }), false);
});

test("the loader separates test records without unlinking them and adds no reads", () => {
  const loader = service.slice(service.indexOf("export async function loadGasBillsWorkspace("), service.indexOf("export async function getGasBillById("));
  assert.match(loader, /for \(const bill of linked\.filter\(isGasTestRecord\)\) testRecords\.push\(\{ bill, packageLabel: monthLabel\(monthKey\) \}\);/);
  assert.match(loader, /groupHistoricalGasBills\(outsideTb810\.filter\(\(bill\) => !isGasTestRecord\(bill\)\)\)/);
  // Grouping is computed from rows already loaded; the loader issues the same reads as before.
  assert.equal((loader.match(/\.from\("tb810_gas_bills"\)/g) ?? []).length, 3);
  assert.doesNotMatch(loader, /\.update\(|\.delete\(|\.insert\(|\.rpc\("tb810_set_gas_bill_selection"/);
});

test("the Processed view lists historical purchases first and test records last, read-only", () => {
  const processed = workspace.slice(workspace.indexOf("function ProcessedContent"));
  assert.ok(processed.indexOf("Historical supplier purchases") < processed.indexOf("Historical test records"));
  assert.match(processed, /Used in the approved \$\{record\.packageLabel\} TB810 test package/);
  assert.match(processed, /Not a supplier purchase; kept read-only for traceability\./);
  // Processed tables never receive the pool controls.
  assert.doesNotMatch(processed, /pool=\{/);
  assert.doesNotMatch(processed, /onSelect=\{/);
});
