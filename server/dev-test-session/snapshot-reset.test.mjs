import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20260916120000_dev_monthly_obligation_snapshot_reset.sql", import.meta.url), "utf8");

test("DEV snapshot ownership is journaled in the canonical persistence transaction", () => {
  assert.match(migration, /create or replace function public\.tb810_create_dev_monthly_obligation_snapshot/);
  assert.match(migration, /v_preexisting_obligation_count > 0/);
  assert.match(migration, /v_result := public\.tb810_create_monthly_obligation_snapshot/);
  assert.match(migration, /'obligations'::public\.tb810_dev_test_domain/);
  assert.match(migration, /'monthly_snapshot'/);
  assert.match(migration, /'billing_period_existed'/);
  assert.match(migration, /'gas_supplier_bills'/);
});

test("DEV snapshot reset guards approval and restores owned financial state", () => {
  assert.match(migration, /snapshot_period\.status <> 'ready_for_review'/);
  assert.match(migration, /snapshot_period\.approved_by is not null/);
  assert.match(migration, /snapshot_period\.approved_at is not null/);
  assert.match(migration, /current_processed_at is distinct from after_processed_at/);
  assert.match(migration, /set processed_at = nullif\(gas_state->>'before_processed_at'/);
  assert.match(migration, /delete from public\.tb810_monthly_financial_obligations/);
  assert.match(migration, /delete from public\.tb810_billing_periods/);
});
