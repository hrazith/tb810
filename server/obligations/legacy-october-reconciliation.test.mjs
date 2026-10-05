import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20261004140000_reconcile_legacy_october_k6.sql", import.meta.url), "utf8");

test("legacy October reconciliation is narrowly guarded and native-empty safe", () => {
  assert.match(migration, /tb810_reconcile_legacy_october_package/);
  assert.match(migration, /875f5d5e-949a-4253-8727-a471734e6083/);
  assert.match(migration, /b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810/);
  assert.match(migration, /period_year = 2026/);
  assert.match(migration, /period_month = 10/);
  assert.match(migration, /status <> 'ready_for_review'/);
  assert.match(migration, /approved_at is not null/);
  assert.match(migration, /gas_reservation_state is not null/);
  assert.match(migration, /gas_reservation_state = case when cardinality/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /Available Gas pool changed before October reconciliation/);
  assert.match(migration, /insert into public\.tb810_dev_test_mutations/);
  assert.match(migration, /'monthly_handoff'/);
  assert.match(migration, /reconciliation_fingerprint/);
  assert.match(migration, /5b8d0f483d1cf1c88457a0aacede0b505e07db93e2e0100a75f79d7d6e1846d4/);
  assert.match(migration, /tb810_reset_dev_test_session_base/);
  assert.match(migration, /billing_period_before.*gas_reservation_state/);
});

test("reconciliation cannot create obligation rows or alter unrelated months", () => {
  assert.doesNotMatch(migration, /insert into public\.tb810_monthly_financial_obligations/);
  assert.doesNotMatch(migration, /period_month = 11/);
  assert.doesNotMatch(migration, /period_month = 9/);
  assert.match(migration, /where billing_period_id = v_period\.id/);
});
