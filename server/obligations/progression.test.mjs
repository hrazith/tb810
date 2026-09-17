import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260916140000_giuliana_package_progression.sql", "utf8");

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
