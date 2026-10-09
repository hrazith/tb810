import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import createJiti from "jiti";

// Default inclusion, explicit exclusion, pool calculation and lifecycle
// protection for Gas supplier purchases. Database-level protection (processed
// and reserved purchases cannot be re-selected or edited) is enforced by
// 20261008120000_gas_production_contract and was executed against a
// disposable PostgreSQL; these tests pin the application side.
const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd()) } });
const { selectGasBillsForLifecycle } = jiti("../obligations/owner-facts.ts");
const { calculateGasCharges } = jiti("./calculation.ts");
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const service = read("./index.ts");
const workspace = read("../../app/(staff)/gas/bills/_components/gas-bills-workspace.tsx");
const migration = read("../../supabase/migrations/20261008120000_gas_production_contract.sql");

const bill = (id, overrides = {}) => ({
  id, amount: 460, invoice_date: "2026-09-04", processed_at: null, reserved_billing_period_id: null, selected_obligation_month: "2026-10-01", ...overrides,
});
const live = { mode: "live", billingPeriodId: null, billingPeriodStatus: null, gasReservationState: null };

function octoberPool(bills) {
  return selectGasBillsForLifecycle(bills, live, "2026-10");
}

function allocate(bills) {
  const pool = octoberPool(bills);
  return calculateGasCharges({
    sourceReadingMonth: "2026-09",
    obligationMonth: "2026-10",
    reservationState: null,
    supplierBills: pool.map((b) => ({ billId: b.id, amount: String(b.amount), status: b.processed_at ? "processed" : "unprocessed" })),
    units: [
      { unitId: "u1", unitNumber: "1201", unitTypeCode: "condo", hasGasService: true, consumption: "9.155" },
      { unitId: "u2", unitNumber: "304", unitTypeCode: "condo", hasGasService: true, consumption: "1.333" },
      { unitId: "u3", unitNumber: "305", unitTypeCode: "condo", hasGasService: true, consumption: "0" },
    ],
  });
}

const canonicalOctober = [
  bill("sep-04", { invoice_date: "2026-09-04" }),
  bill("sep-11", { invoice_date: "2026-09-11" }),
  bill("sep-18", { invoice_date: "2026-09-18" }),
  bill("aug-24", { invoice_date: "2026-08-24" }),
];

test("included purchases form the pool; the purchase date never assigns membership", () => {
  const pool = octoberPool([
    ...canonicalOctober,
    bill("aug-05-excluded", { invoice_date: "2026-08-05", selected_obligation_month: null }),
    bill("nov", { invoice_date: "2026-09-30", selected_obligation_month: "2026-11-01" }),
    bill("processed", { invoice_date: "2026-07-30", processed_at: "2026-09-09T00:00:00Z", selected_obligation_month: null }),
  ]);
  assert.deepEqual(pool.map((b) => b.id), ["sep-04", "sep-11", "sep-18", "aug-24"]);
  assert.equal(pool.reduce((s, b) => s + b.amount, 0), 1840);
});

test("excluding a purchase removes it from the Gas allocation; restoring brings it back", () => {
  const all = allocate(canonicalOctober);
  assert.equal(all.gasCostPool, "1840.00");
  const excluded = allocate(canonicalOctober.map((b) => (b.id === "sep-18" ? { ...b, selected_obligation_month: null } : b)));
  assert.equal(excluded.gasCostPool, "1380.00");
  const unit1201 = (r) => Number(r.unitCharges.find((c) => c.unitNumber === "1201").amount);
  assert.ok(unit1201(excluded) < unit1201(all), "exclusion lowers each Unit's share");
  const restored = allocate(canonicalOctober.map((b) => ({ ...b })));
  assert.equal(restored.gasCostPool, "1840.00");
  assert.equal(unit1201(restored), unit1201(all));
});

test("a handed-off package uses its reserved purchases, never the live selection", () => {
  const handedOff = { mode: "snapshotted", billingPeriodId: "period-oct", billingPeriodStatus: "ready_for_review", gasReservationState: "native_reserved" };
  const pool = selectGasBillsForLifecycle([
    bill("reserved", { reserved_billing_period_id: "period-oct" }),
    bill("selected-late", { selected_obligation_month: "2026-10-01" }),
  ], handedOff, "2026-10");
  assert.deepEqual(pool.map((b) => b.id), ["reserved"]);
});

test("new purchases are included in the open pool by default, never silently excluded", () => {
  const create = service.slice(service.indexOf("export async function createGasBill("), service.indexOf("export async function updateGasBill("));
  assert.ok(create.indexOf(".insert(") < create.indexOf("includeNewGasBillInOpenPool(supabase, building.data.id, data.id)"));
  const include = service.slice(service.indexOf("async function includeNewGasBillInOpenPool("), service.indexOf("export async function loadGasBillsWorkspace("));
  assert.match(include, /getOpenGasPoolMonth\(supabase, buildingId\)/);
  assert.match(include, /rpc\("tb810_set_gas_bill_selection", \{ p_bill_id: billId, p_obligation_month: `\$\{poolMonth\.data\}-01` \}\)/);
  // A failed inclusion removes the new purchase instead of leaving it excluded.
  assert.match(include, /\.delete\(\)\.eq\("id", billId\)/);
  // Workbook re-imports keep the operator's existing inclusion/exclusion.
  assert.match(service, /if \(!existing\.data\) \{\s*const inclusionError = await includeNewGasBillInOpenPool\(supabase, building\.data\.id, upserted\.id\);/);
  // The open pool is the next package not yet handed off; dates play no part.
  const poolMonth = service.slice(service.indexOf("async function getOpenGasPoolMonth("), service.indexOf("async function includeNewGasBillInOpenPool("));
  assert.match(poolMonth, /activePackage\.obligationMonth/);
  assert.doesNotMatch(poolMonth, /invoice_date/);
});

test("processed and reserved purchases stay read-only and cannot be reassigned", () => {
  // Processed purchases render only in the Processed tab, without pool controls.
  assert.match(workspace, /function ProcessedContent[\s\S]*<BillTable bills=\{bundle\.bills\} \/>/);
  assert.match(workspace, /<BillTable bills=\{group\.bills\} \/>/);
  assert.match(workspace, /<BillTable bills=\{data\.testRecords\.map\(\(record\) => record\.bill\)\} \/>/);
  assert.match(workspace, /if \(bill\.reserved_billing_period_id\) \{\s*return <span className="text-sm text-zinc-500">Reserved/);
  // Pending lists unprocessed purchases only.
  const loader = service.slice(service.indexOf("export async function loadGasBillsWorkspace("), service.indexOf("export async function getGasBillById("));
  assert.match(loader, /\.from\("tb810_gas_bills"\)\s*\.select\(GAS_BILL_SELECT\)\s*\.eq\("building_id", building\.data\.id\)\s*\.is\("processed_at", null\)/);
  // The database refuses to re-select processed or reserved purchases.
  const selection = migration.slice(migration.indexOf("create or replace function public.tb810_set_gas_bill_selection("));
  assert.match(selection, /if v_bill\.processed_at is not null then raise exception 'Processed Gas purchases are read-only\.'; end if;/);
  assert.match(selection, /if v_bill\.reserved_billing_period_id is not null then\s*raise exception 'Gas purchases reserved to a Monthly Obligations package are read-only\.';/);
});
