import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260916140000_giuliana_package_progression.sql", "utf8");
const correctiveMigration = fs.readFileSync("supabase/migrations/20261001130000_fix_giuliana_package_progression_handoff.sql", "utf8");

test("progression lookup is a recursive set-based contiguous-prefix query", () => {
  assert.match(migration, /with recursive progression as/);
  assert.match(migration, /left join public\.tb810_billing_periods bp/);
  assert.match(migration, /where progression\.handed_off/);
  assert.match(migration, /where not handed_off/);
  assert.match(migration, /mostRecentHandoff/);
  assert.doesNotMatch(migration, /generate_series/);
});

test("progression lookup recognizes every handed-off lifecycle status", () => {
  for (const status of ["ready_for_review", "approved", "invoices_generated", "closed"]) {
    assert.ok(migration.includes(`'${status}'`), `missing ${status}`);
  }
});

test("corrective handoff lookup searches prior periods independently of forward progression", () => {
  assert.match(correctiveMigration, /handoff as \(\s*select[\s\S]*?from public\.tb810_billing_periods bp\s+cross join active/);
  assert.match(correctiveMigration, /\(bp\.period_year \* 12 \+ bp\.period_month\) < active\.month_ordinal/);
  assert.match(correctiveMigration, /bp\.status in \('ready_for_review', 'approved', 'invoices_generated', 'closed'\)/);
  assert.match(correctiveMigration, /order by bp\.period_year desc, bp\.period_month desc\s+limit 1/);
  assert.doesNotMatch(correctiveMigration, /handoff as \(\s*select \*[\s\S]*?from progression/);
});

test("corrective migration preserves active package and function contract", () => {
  assert.match(correctiveMigration, /create or replace function public\.tb810_get_giuliana_package_progression\(\s*p_building_id uuid,\s*p_start_year integer,\s*p_start_month integer\s*\)/);
  assert.match(correctiveMigration, /'activePackage'/);
  assert.match(correctiveMigration, /'mostRecentHandoff'/);
  assert.match(correctiveMigration, /grant execute on function public\.tb810_get_giuliana_package_progression\(uuid, integer, integer\) to authenticated, service_role/);
});
