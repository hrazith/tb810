import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261008140000_production_dev_isolation.sql"),
  "utf8",
);

const read = (file) => readFileSync(path.join(root, file), "utf8");

const apiRoles = /from public, anon, authenticated, service_role/;

test("DEV tables have no application-role grants or RLS policies", () => {
  for (const table of ["tb810_dev_test_sessions", "tb810_dev_test_mutations"]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role`));
  }
  for (const policy of [
    "tb810 staff can read dev test sessions",
    "tb810 staff can manage dev test sessions",
    "tb810 staff can read dev test mutations",
    "tb810 staff can manage dev test mutations",
  ]) {
    assert.match(migration, new RegExp(`drop policy if exists "${policy}"`));
  }
});

test("all live DEV RPCs and internal helpers are denied to every API role", () => {
  const deniedSignatures = [
    "tb810_approve_dev_monthly_obligation\\(uuid, uuid, integer, integer, jsonb, uuid\\[\\]\\)",
    "tb810_create_dev_common_water_bill_with_document\\(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, numeric, numeric, text, text, text, text, bigint, jsonb\\)",
    "tb810_create_dev_monthly_obligation_snapshot\\(uuid, uuid, integer, integer, jsonb, uuid\\[\\]\\)",
    "tb810_mark_dev_monthly_obligation_ready_for_review\\(uuid, uuid, integer, integer, integer, integer, uuid\\[\\]\\)",
    "tb810_prepare_dev_monthly_obligation_reset\\(uuid\\)",
    "tb810_reset_dev_test_session\\(uuid\\)",
    "tb810_reset_dev_test_session_base\\(uuid\\)",
    "tb810_sync_dev_gas_reading_import\\(uuid, text, jsonb\\)",
    "tb810_sync_dev_meter_reading_import\\(uuid, text, jsonb\\)",
    "tb810_clear_current_unit_water_month_dev\\(text, uuid\\)",
    "tb810_clear_current_gas_reading_month_dev\\(text, uuid\\)",
    "tb810_create_bulk_charge_dev\\(text, text, numeric, text, text, text, uuid\\)",
  ];
  for (const signature of deniedSignatures) {
    const revoke = new RegExp(`revoke all on function public\\.${signature}\\s+from public, anon, authenticated, service_role`);
    assert.match(migration, revoke, signature);
  }
  assert.match(migration, apiRoles);
});

test("PUBLIC and inherited default EXECUTE privileges are closed for both function owners", () => {
  for (const owner of ["postgres", "supabase_admin"]) {
    assert.match(
      migration,
      new RegExp(`alter default privileges for role ${owner} in schema public\\s+revoke execute on functions from public, anon, authenticated, service_role`),
    );
  }
});

test("normal Water, Gas, and Charge RPCs expose exact production-only signatures", () => {
  assert.match(migration, /create function public\.tb810_clear_current_unit_water_month\(p_month_key text\)/);
  assert.match(migration, /create function public\.tb810_clear_current_gas_reading_month\(p_month_key text\)/);
  assert.match(migration, /create function public\.tb810_create_bulk_charge\([\s\S]*?p_ends_month text default null[\s\S]*?\)/);
  assert.match(migration, /tb810_clear_current_unit_water_month_dev\(p_month_key, null::uuid\)/);
  assert.match(migration, /tb810_clear_current_gas_reading_month_dev\(p_month_key, null::uuid\)/);
  assert.match(migration, /tb810_create_bulk_charge_dev\([\s\S]*?null::uuid[\s\S]*?\)/);
  assert.doesNotMatch(migration, /create function public\.tb810_(?:clear_current_unit_water_month|clear_current_gas_reading_month|create_bulk_charge)\([^;]*p_dev_session_id/);

  for (const signature of [
    "tb810_clear_current_unit_water_month\\(text\\)",
    "tb810_clear_current_gas_reading_month\\(text\\)",
    "tb810_create_bulk_charge\\(text, text, numeric, text, text, text\\)",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
  }
});

test("production callers cannot submit DEV session authority", () => {
  const callers = [
    ["server/water/unit-meter-readings.ts", "tb810_clear_current_unit_water_month"],
    ["server/gas/index.ts", "tb810_clear_current_gas_reading_month"],
    ["server/charges/index.ts", "tb810_create_bulk_charge"],
  ];
  for (const [file, rpc] of callers) {
    const source = read(file);
    const start = source.indexOf(`.rpc("${rpc}"`);
    assert.notEqual(start, -1, `${file} calls ${rpc}`);
    const call = source.slice(start, source.indexOf("});", start) + 3);
    assert.doesNotMatch(call, /p_dev_session_id/);
  }
});

test("every DEV Server Action rejects a production invocation before work", () => {
  const guardedActions = new Map([
    ["server/dev-test-session/actions.ts", [
      "startDevTestSessionAction",
      "resetDevTestSessionAction",
      "resetDevMonthlyObligationApprovalAction",
      "runMonthlyObligationPulseAction",
    ]],
    ["server/water/actions.ts", ["completeWaterReadingsAction", "addCommonWaterBillAction"]],
    ["server/gas/actions.ts", ["completeGasReadingsAction", "addGasSupplierBillAction"]],
    ["server/charges/actions.ts", ["addUnitChargeAction"]],
    ["server/business-date/actions.ts", ["setDevBusinessDateAction", "clearDevBusinessDateAction"]],
  ]);
  for (const [file, actions] of guardedActions) {
    const source = read(file);
    for (const action of actions) {
      const declaration = source.indexOf(`export async function ${action}`);
      assert.notEqual(declaration, -1, `${file}: ${action}`);
      assert.match(source.slice(declaration, declaration + 300), /assertDevelopmentOnly\(\)/, `${file}: ${action}`);
    }
  }
  assert.match(read("server/dev-only.ts"), /process\.env\.NODE_ENV !== "development"/);
});

test("production obligation approval and pulse contracts are not revoked", () => {
  assert.doesNotMatch(migration, /revoke[^;]+tb810_approve_monthly_obligation\(/);
  assert.doesNotMatch(migration, /revoke[^;]+tb810_create_monthly_obligation_snapshot_system\(/);
  assert.doesNotMatch(migration, /revoke[^;]+tb810_mark_monthly_obligation_ready_for_review_system\(/);
  assert.doesNotMatch(migration, /revoke[^;]+tb810_persist_monthly_obligation_snapshot\(/);
});
