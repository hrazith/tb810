import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260916140000_giuliana_package_progression.sql", "utf8");
const correctiveMigration = fs.readFileSync("supabase/migrations/20261001130000_fix_giuliana_package_progression_handoff.sql", "utf8");
const k64Migration = fs.readFileSync("supabase/migrations/20261004150000_fix_carlos_approval_eligibility.sql", "utf8");

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

test("K6.2 progression exposes a bounded oldest-first Carlos review queue", () => {
  const migration = fs.readFileSync("supabase/migrations/20261003120000_carlos_oldest_first_approval.sql", "utf8");
  assert.match(migration, /pending_reviews as/);
  assert.match(migration, /row_number\(\) over \(order by bp\.period_year, bp\.period_month\)/);
  assert.match(migration, /'approvalEligible', review\.review_order = 1/);
  assert.match(migration, /'pendingReviews', pending_reviews\.value/);
});

test("K6.2 approval boundary rejects a newer ready-for-review period", () => {
  const migration = fs.readFileSync("supabase/migrations/20261003120000_carlos_oldest_first_approval.sql", "utf8");
  assert.match(migration, /before update of status on public\.tb810_billing_periods/);
  assert.match(migration, /earlier\.status = 'ready_for_review'/);
  assert.match(migration, /An earlier Monthly Obligation must be approved first\./);
});

test("K6.4 separates review ordering from native approval eligibility", () => {
  assert.match(k64Migration, /'outstanding', true/);
  assert.match(k64Migration, /'chronologicallyActionable', review\.review_order = 1/);
  assert.match(k64Migration, /'approvalEligible', review\.review_order = 1\s+and review\.gas_reservation_state in \('native_reserved', 'native_empty'\)/);
  assert.doesNotMatch(k64Migration, /'approvalEligible', review\.review_order = 1\s*\)/);
});
