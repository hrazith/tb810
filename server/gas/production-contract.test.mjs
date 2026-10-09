import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static structure checks for the Gas production contract. The runtime
// scenarios (freeze matrix, explicit pool, provenance, two-session races) were
// executed against a disposable PostgreSQL loaded with the live schema.
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20261008120000_gas_production_contract.sql");
const service = read("./index.ts");
const devBill = read("./dev-bill.ts");
const ownerFacts = read("../obligations/owner-facts.ts");
const snapshot = read("../obligations/snapshot.ts");

function sqlFunction(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  return migration.slice(start, migration.indexOf("\n$$;", start) + 4);
}

function tsFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const next = source.indexOf("\nexport ", start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
}

function position(body, pattern, label) {
  const index = body.search(pattern);
  assert.ok(index >= 0, `missing ${label}`);
  return index;
}

test("purchase provenance: supplier and invoice are optional and never blank placeholders", () => {
  assert.match(migration, /alter column invoice_number drop not null/);
  assert.match(migration, /alter column supplier_name drop not null/);
  assert.match(migration, /check \(invoice_number is null or btrim\(invoice_number\) <> ''\)/);
  assert.match(migration, /check \(supplier_name is null or btrim\(supplier_name\) <> ''\)/);
});

test("package membership is an explicit selection, never a purchase date", () => {
  assert.match(migration, /add column if not exists selected_obligation_month date/);
  const handoff = sqlFunction("tb810_mark_monthly_obligation_ready_for_review_internal");
  assert.match(handoff, /selected_obligation_month = make_date\(p_period_year, p_period_month, 1\)/);
  assert.doesNotMatch(handoff, /invoice_date/);
  assert.match(handoff, /Gas bill set changed before handoff/);
  assert.match(migration, /revoke all on function public\.tb810_mark_monthly_obligation_ready_for_review_internal\(uuid, integer, integer, integer, integer, uuid\[\]\) from public, anon, authenticated;/);
});

test("selection takes the pool locks before the purchase row lock and rejects frozen purchases", () => {
  const selection = sqlFunction("tb810_set_gas_bill_selection");
  const poolLock = position(selection, /perform public\.tb810_lock_gas_pool_open/, "pool lock");
  const rowLock = position(selection, /for update;/, "purchase row lock");
  assert.ok(poolLock < rowLock, "advisory locks precede the row lock, matching handoff");
  assert.match(selection, /order by m/);
  assert.match(selection, /Gas purchase selection changed; review the pool again\./);
  assert.match(selection, /Processed Gas purchases are read-only\./);
  assert.match(selection, /reserved to a Monthly Obligations package are read-only/);
  const poolOpen = sqlFunction("tb810_lock_gas_pool_open");
  assert.ok(position(poolOpen, /pg_advisory_xact_lock_shared/, "shared lock") < position(poolOpen, /select bp\.status into v_status/, "status read"));
  assert.match(poolOpen, /v_status in \('ready_for_review', 'approved', 'invoices_generated', 'closed'\)/);
});

test("purchase lifecycle columns change only through lifecycle functions", () => {
  const guard = sqlFunction("tb810_guard_gas_bill_lifecycle");
  assert.match(guard, /Gas purchases are created available/);
  assert.match(guard, /Processed Gas purchases are read-only\./);
  assert.match(guard, /reserved to a Monthly Obligations package are read-only/);
  assert.match(guard, /change only through the package lifecycle/);
  assert.match(migration, /before insert or update or delete on public\.tb810_gas_bills/);
  for (const name of ["tb810_set_gas_bill_selection", "tb810_mark_monthly_obligation_ready_for_review_internal", "tb810_persist_monthly_obligation_snapshot", "tb810_reset_dev_test_session"]) {
    const body = sqlFunction(name);
    const opened = body.split("set_config('tb810.gas_lifecycle_write', 'on', true)").length - 1;
    const closed = body.split("set_config('tb810.gas_lifecycle_write', '', true)").length - 1;
    assert.ok(opened >= 1 && opened === closed, `${name} scopes the lifecycle flag`);
  }
});

test("every Gas reading write path follows the shared source freeze", () => {
  const guard = sqlFunction("tb810_guard_gas_reading_source_freeze");
  assert.match(guard, /order by m/);
  assert.match(guard, /perform public\.tb810_lock_source_month_open\(v_building_id, v_month, 'Gas source month'\)/);
  assert.match(migration, /before insert or update or delete on public\.tb810_gas_readings/);
  assert.match(migration, /alter table public\.tb810_gas_readings enable row level security;/);

  const importFn = sqlFunction("tb810_sync_gas_reading_import");
  assert.ok(
    position(importFn, /tb810_lock_source_month_open\(v_building_id, v_month_start, 'Gas source month'\)/, "import freeze")
      < position(importFn, /select count\(\*\) into v_expected_count/, "first read"),
  );

  const startOver = sqlFunction("tb810_clear_current_gas_reading_month");
  assert.doesNotMatch(startOver, /to_char\(current_date, 'YYYY-MM'\)/);
  assert.match(startOver, /Future Gas months cannot be started over\./);
  assert.ok(
    position(startOver, /tb810_lock_source_month_open\(v_building_id, v_month_start, 'Gas source month'\)/, "Start Over freeze")
      < position(startOver, /delete from public\.tb810_gas_readings/, "delete"),
  );
});

test("approval proves Gas provenance inside the package lock", () => {
  const persist = sqlFunction("tb810_persist_monthly_obligation_snapshot");
  const lock = position(persist, /pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key/, "package lock");
  const sedapal = position(persist, /tb810_assert_sedapal_provenance/, "Sedapal check");
  const gas = position(persist, /tb810_assert_gas_provenance/, "Gas check");
  const insert = position(persist, /insert into public\.tb810_monthly_financial_obligations/, "insert");
  assert.ok(lock < sedapal && sedapal < gas && gas < insert);

  const assertion = sqlFunction("tb810_assert_gas_provenance");
  assert.match(assertion, /array\['sourceMonth', 'readingId', 'unitConsumption', 'billIds', 'poolTotal'\]/);
  assert.match(assertion, /Gas provenance is missing from the % Monthly Obligations package\./);
  assert.match(assertion, /Gas source changed after review for the % Monthly Obligations package\./);
  assert.match(assertion, /gr\.reading_month = v_source_month/);
  assert.match(assertion, /gr\.consumption = \(v_declared->>'unitConsumption'\)::numeric/);
});

test("the app reads the explicit pool, declares provenance and gates Start Over by lifecycle", () => {
  assert.match(ownerFacts, /bill\.selected_obligation_month\?\.slice\(0, 7\) === packageMonth/);
  assert.match(snapshot, /\.\.\.\(gasProvenance \? \{ gasProvenance \} : \{\}\)/);

  const clear = tsFunction(service, "export async function clearCurrentGasMonth(");
  assert.match(clear, /gasReadingMonthEditError\(monthKey, await getBusinessNow\(\)\)/);
  assert.doesNotMatch(clear, /getActiveReadingMonth/);

  const selection = tsFunction(service, "export async function setGasBillSelection(");
  assert.match(selection, /rpc\("tb810_set_gas_bill_selection"/);
  assert.match(devBill, /rpc\("tb810_set_gas_bill_selection"/);
  assert.doesNotMatch(devBill, /Not recorded/);
});
