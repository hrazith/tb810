import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260923130000_dev_sedapal_reset.sql", import.meta.url),
  "utf8",
);
const resetAction = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
const waterAction = readFileSync(
  new URL("../../app/(staff)/water/sedapal/actions.ts", import.meta.url),
  "utf8",
);

test("DEV Sedapal creation journals the exact bill, document, and Storage identity atomically", () => {
  assert.match(migration, /tb810_create_dev_common_water_bill_with_document/);
  assert.match(migration, /tb810_create_common_water_bill_with_document/);
  assert.match(migration, /'document_id', v_document_id/);
  assert.match(migration, /'storage_bucket', p_storage_bucket/);
  assert.match(migration, /'storage_path', p_storage_path/);
  assert.match(migration, /insert into public\.tb810_dev_test_mutations/);
  assert.match(waterAction, /dev_test_context/);
  assert.match(waterAction, /devSessionId/);
});

test("ordinary Sedapal submissions do not select the DEV wrapper", () => {
  assert.match(waterAction, /createCommonWaterBill\(validation\.data, \{ devSessionId \}\)/);
  assert.match(waterAction, /formData\.get\("dev_test_context"\) === "1"/);
});

test("reset deletes the exact owned document before the exact utility bill", () => {
  assert.match(migration, /delete from public\.tb810_documents[\s\S]*document_id/);
  assert.match(migration, /set_config\('tb810\.dev_common_water_reset_bill_id'/);
  assert.match(migration, /delete from public\.tb810_utility_bills where id = mutation\.record_identity::uuid/);
  assert.match(resetAction, /tb810_dev_test_mutations/);
  assert.match(resetAction, /storage_bucket/);
  assert.match(resetAction, /storage_path/);
  assert.match(resetAction, /storage[\s\S]*remove\(\[storagePath\]\)/);
  assert.ok(resetAction.indexOf("remove([storagePath])") < resetAction.indexOf('"tb810_reset_dev_test_session"'));
});

test("reset has no broad Storage cleanup path", () => {
  assert.doesNotMatch(resetAction, /remove\(\[.*\*|removeAll|list\(/);
  assert.doesNotMatch(migration, /storage\.objects|delete from storage/);
});

test("Common Water immutability remains blocked outside the exact DEV reset identity", () => {
  assert.match(migration, /current_setting\('tb810\.dev_common_water_reset_bill_id', true\) = old\.id::text/);
  assert.match(migration, /raise exception 'Common water bills are immutable'/);
});
