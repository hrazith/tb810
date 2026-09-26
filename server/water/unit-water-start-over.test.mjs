import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260925120000_clear_current_unit_water_month.sql", import.meta.url),
  "utf8",
);
const action = readFileSync(
  new URL("../../app/(staff)/water/unit-meter-readings/actions.ts", import.meta.url),
  "utf8",
);
const mutation = readFileSync(new URL("./unit-meter-readings.ts", import.meta.url), "utf8");
const workspace = readFileSync(
  new URL("../../app/(staff)/water/unit-meter-readings/_components/upload-completed-template-button.tsx", import.meta.url),
  "utf8",
);

test("Start over is a current-month atomic Unit Water operation", () => {
  assert.match(migration, /returns integer/);
  assert.match(migration, /p_month_key <> to_char\(current_date, 'YYYY-MM'\)/);
  assert.match(migration, /reading_month = make_date/);
  assert.match(migration, /delete from public\.tb810_meter_readings/);
  assert.match(migration, /delete from public\.tb810_dev_test_mutations/);
  assert.match(migration, /v_owned_count <> v_reading_count/);
  assert.doesNotMatch(migration, /delete from public\.tb810_meter_readings[\s\S]*for .*loop/);
});

test("Start over preserves DEV ownership boundaries and excludes historical months", () => {
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /mutation\.domain = 'water'/);
  assert.match(migration, /mutation\.record_type = 'meter_reading'/);
  assert.match(migration, /mutation\.operation = 'create'/);
  assert.match(mutation, /tb810_clear_current_unit_water_month/);
  assert.match(mutation, /getActiveReadingMonth\(\)/);
  assert.match(workspace, /currentReadingCount > 0/);
  assert.match(workspace, /Start over .*readings/);
});

test("Start over does not use the per-row delete action", () => {
  assert.match(action, /clearCurrentUnitWaterMonthAction/);
  assert.match(action, /revalidatePath\(`\/water\/unit-meter-readings\/\$\{monthKey\}`\)/);
  assert.doesNotMatch(action, /clearCurrentUnitWaterMonthAction[\s\S]*deleteUnitMeterReading\(/);
});
