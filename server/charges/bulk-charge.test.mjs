import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);

const migration = fs.readFileSync(
  new URL("../../supabase/migrations/20260929130000_fix_universal_add_charge_series.sql", import.meta.url),
  "utf8",
);

test("universal bulk charge RPC creates independent series in one atomic operation", () => {
  assert.match(migration, /create or replace function public\.tb810_create_bulk_charge/);
  assert.match(migration, /p_target_kind text/);
  assert.match(migration, /p_target_kind not in \('all_units', 'all_owners'\)/);
  assert.match(migration, /join public\.tb810_unit_types ut on ut\.id = u\.unit_type_id/);
  assert.match(migration, /ut\.code = 'condo'/);
  assert.match(migration, /v_series_id := gen_random_uuid\(\)/);
  assert.doesNotMatch(migration, /v_series_id uuid := gen_random_uuid\(\)/);
  assert.match(migration, /insert into public\.tb810_charges/);
  assert.match(migration, /p_dev_session_id is not null/);
  assert.match(migration, /insert into public\.tb810_dev_test_mutations/);
  assert.match(migration, /return query select null::uuid, v_target_count, p_amount \* v_target_count/);
});

test("bulk amount is per selected target and one-off charges have no end month", () => {
  assert.match(migration, /p_schedule = 'one_off' and v_end_month is not null/);
  assert.match(migration, /p_amount is null or p_amount = 0/);
  assert.match(migration, /effective_from_month, effective_to_month/);
});

test("each target is journaled after its independent charge series is inserted", () => {
  const insertIndex = migration.indexOf("insert into public.tb810_charges");
  const journalIndex = migration.indexOf("insert into public.tb810_dev_test_mutations");
  const loopEndIndex = migration.indexOf("end loop;", journalIndex);

  assert.ok(insertIndex >= 0);
  assert.ok(journalIndex > insertIndex);
  assert.ok(loopEndIndex > journalIndex);
  assert.match(migration, /record_identity,[\s\S]*v_series_id::text/);
});

test("database failures are mapped to a safe Add Charge message", async () => {
  const { userFacingChargeError } = jiti("./user-facing-error.ts");

  assert.equal(
    userFacingChargeError('duplicate key value violates unique constraint "tb810_charges_series_start_unique"'),
    "Unable to save this charge. Please try again.",
  );
  assert.equal(userFacingChargeError("Amount must be greater than zero."), "Amount must be greater than zero.");
});
