import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { canMutateGasBills, classifyGasBillMutationFailure } = jiti("./index.ts");
const { isValidGasBillDate } = jiti("./validation.ts");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
const validationSource = readFileSync(new URL("./validation.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../../supabase/migrations/20260928120000_harden_gas_supplier_bill_write_boundary.sql", import.meta.url), "utf8");

test("Gas bill mutations require a building manager or super admin", () => {
  assert.equal(canMutateGasBills(["building_staff"]), false);
  assert.equal(canMutateGasBills(["building_manager"]), true);
  assert.equal(canMutateGasBills(["super_admin"]), true);
});

test("Gas bill reads and writes keep the building boundary", () => {
  assert.match(indexSource, /getGasBillById[\s\S]*?eq\("building_id", building\.data\.id\)/);
  assert.match(indexSource, /\.update\([\s\S]*?\.eq\("building_id", building\.data\.id\)/);
  assert.match(indexSource, /\.delete\(\)[\s\S]*?\.eq\("building_id", building\.data\.id\)/);
});

test("Gas bill writes condition on the unprocessed lifecycle state", () => {
  assert.equal((indexSource.match(/\.is\("processed_at", null\)/g) ?? []).length, 3);
  assert.match(indexSource, /classifyGasBillMutationFailure/);
  assert.equal(classifyGasBillMutationFailure(null), "Bill not found or unavailable.");
  assert.equal(classifyGasBillMutationFailure({ processed_at: "2026-09-01T00:00:00Z" }), "Processed bills are read-only.");
});

test("Gas bill validation rejects malformed dates and non-cent amounts", () => {
  assert.equal(isValidGasBillDate("2026-09-30"), true);
  assert.equal(isValidGasBillDate("2026-02-30"), false);
  assert.equal(isValidGasBillDate("09/30/2026"), false);
  assert.match(readFileSync(new URL("./validation.ts", import.meta.url), "utf8"), /z\.number\(\)\.finite\(\)/);
  assert.match(readFileSync(new URL("./validation.ts", import.meta.url), "utf8"), /at most 2 decimal places/);
});

test("Gas bill actions map expected database failures and revalidate", () => {
  assert.match(validationSource, /Invoice \/ receipt number already exists/);
  assert.match(actionsSource, /revalidatePath\("\/gas\/bills", "layout"\)/);
});

test("Gas bill RLS allows staff reads and manager mutations only", () => {
  assert.match(migrationSource, /enable row level security/);
  assert.match(migrationSource, /public\.is_tb810_staff\(\)/);
  assert.match(migrationSource, /public\.has_tb810_role\('building_manager'\)/);
  assert.match(migrationSource, /public\.has_tb810_role\('super_admin'\)/);
});
