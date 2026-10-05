import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20261004120000_gas_bill_pool_reservation.sql", import.meta.url), "utf8");
const overloadHotfix = readFileSync(new URL("../../supabase/migrations/20261004130000_drop_legacy_obligation_handoff_overload.sql", import.meta.url), "utf8");

test("Gas reservation keeps available, reserved, and processed states distinct", () => {
  assert.match(migration, /add column if not exists reserved_billing_period_id/);
  assert.doesNotMatch(migration, /reserved_obligation_month/);
  assert.match(migration, /gas_reservation_state/);
  assert.match(migration, /processed_at is null/);
  assert.match(migration, /set reserved_billing_period_id = v_period\.id/);
  assert.match(migration, /set processed_at = coalesce/);
  assert.match(migration, /on delete restrict/);
  assert.match(migration, /reserved_period_same_building_fk/);
  assert.match(migration, /tb810_require_gas_reservation_on_approval/);
  assert.match(migration, /old\.status = 'ready_for_review' and new\.status in \('collecting_readings', 'approved'\)/);
  assert.match(migration, /tb810_gas_bills_reserved_building_period_idx/);
  assert.match(migration, /revoke insert \(reserved_billing_period_id\), update \(reserved_billing_period_id\)/);
  assert.match(migration, /revoke insert \(gas_reservation_state\), update \(gas_reservation_state\)/);
});

test("empty Gas pools remain valid handoff inputs", () => {
  assert.match(migration, /p_gas_bill_ids uuid\[\] default '\{\}'/);
  assert.doesNotMatch(migration, /cardinality\(p_gas_bill_ids\) = 0[^\n]*raise exception/);
});

test("legacy pending packages are not backfilled", () => {
  assert.doesNotMatch(migration, /insert into public\.tb810_gas_bills/);
  assert.match(migration, /requires Gas reservation reconciliation before approval/);
  assert.match(migration, /set reserved_billing_period_id = null/);
});

test("handoff rejects NULL bill IDs and journals DEV reservation ownership", () => {
  assert.match(migration, /Gas bill reservation cannot contain NULL IDs/);
  assert.match(migration, /Gas bill approval set cannot contain NULL IDs/);
  assert.match(migration, /gas_reservation_before/);
  assert.match(migration, /before_reserved_billing_period_id/);
  assert.match(migration, /reserved_billing_period_id = mutation\.record_identity::uuid/);
  assert.doesNotMatch(migration, /where reserved_billing_period_id = v_period\.id/);
});

test("the forward hotfix removes only the legacy three-argument handoff wrapper", () => {
  assert.match(overloadHotfix, /drop function public\.tb810_mark_monthly_obligation_ready_for_review\(uuid, integer, integer\);/);
  assert.doesNotMatch(overloadHotfix, /cascade/i);
  assert.doesNotMatch(overloadHotfix, /insert|update|delete/i);
});
