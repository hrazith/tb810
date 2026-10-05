import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20261004170000_reconcile_legacy_november_k6.sql", import.meta.url), "utf8");

test("November reconciliation is restricted to the audited package and DEV session", () => {
  assert.match(migration, /tb810_reconcile_legacy_november_package/);
  assert.match(migration, /875f5d5e-949a-4253-8727-a471734e6083/);
  assert.match(migration, /b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810/);
  assert.match(migration, /period_year = 2026/);
  assert.match(migration, /period_month = 11/);
  assert.match(migration, /status <> 'ready_for_review'/);
  assert.match(migration, /gas_reservation_state is not null/);
  assert.match(migration, /monthly_handoff/);
});

test("November reconciliation requires the audited ready financial package and empty Gas pool", () => {
  assert.match(migration, /ff5575cf92690ef8216de60b0b3b875881d6fceb1ba4087a6c51cb27c3c0833e/);
  assert.match(migration, /p_row_count <> 358/);
  assert.match(migration, /p_fixed_amount <> 20051\.80/);
  assert.match(migration, /p_water_amount <> 2933\.99/);
  assert.match(migration, /p_common_water_amount <> 261\.12/);
  assert.match(migration, /p_gas_amount <> 0\.00/);
  assert.match(migration, /p_total_amount <> 23246\.91/);
  assert.match(migration, /Available Gas pool changed before November reconciliation/);
  assert.match(migration, /cardinality\(v_requested_bill_ids\) <> 0/);
});

test("November reconciliation establishes native_empty and journals the prior state", () => {
  assert.match(migration, /set gas_reservation_state = 'native_empty'/);
  assert.match(migration, /'reconciliation_fingerprint', p_fingerprint/);
  assert.match(migration, /'monthly_handoff'/);
  assert.match(migration, /'update'::public\.tb810_dev_test_operation/);
  assert.match(migration, /'billing_period_before', to_jsonb\(v_period\)/);
  assert.match(migration, /'gas_reservation_before', '\[\]'::jsonb/);
});

test("November reconciliation does not create obligations or mutate Gas bills", () => {
  assert.doesNotMatch(migration, /insert into public\.tb810_monthly_financial_obligations/);
  assert.doesNotMatch(migration, /update public\.tb810_gas_bills/);
  assert.doesNotMatch(migration, /delete from public\.tb810_gas_bills/);
  assert.match(migration, /'obligationRowCount', 0/);
});
