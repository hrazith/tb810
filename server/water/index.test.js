/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const createJiti = require("jiti");

const jiti = createJiti(__filename);
const { previousMonthKeyFromMonthKey, countCommonWaterCondoUnits } = jiti("./month-utils.ts");
const { getNextWaterMonthKey } = jiti("./month.ts");
const { isCommonWaterBillEditable } = jiti("./types.ts");

test("obligation month 2026-08 derives source reading month 2026-07", () => {
  assert.equal(previousMonthKeyFromMonthKey("2026-08"), "2026-07");
});

test("obligation month 2026-09 derives source reading month 2026-08", () => {
  assert.equal(previousMonthKeyFromMonthKey("2026-09"), "2026-08");
});

test("obligation month 2027-01 derives source reading month 2026-12", () => {
  assert.equal(previousMonthKeyFromMonthKey("2027-01"), "2026-12");
});

test("Sedapal source months map to the following obligation month", () => {
  assert.equal(getNextWaterMonthKey("2026-08"), "2026-09");
  assert.equal(getNextWaterMonthKey("2026-09"), "2026-10");
});

test("historical Sedapal bills remain read-only without persisted obligations", () => {
  assert.equal(
    isCommonWaterBillEditable({ legacy_table: "utilities", has_persisted_obligation: false }),
    false,
  );
});

test("native Sedapal bills are editable only before obligation creation", () => {
  assert.equal(
    isCommonWaterBillEditable({ legacy_table: "tb810_common_water_ledger", has_persisted_obligation: false }),
    true,
  );
  assert.equal(
    isCommonWaterBillEditable({ legacy_table: "tb810_common_water_ledger", has_persisted_obligation: true }),
    false,
  );
});

test("common water denominator is derived from condo units", () => {
  assert.equal(
    countCommonWaterCondoUnits([
      { unit_type_code: "condo" },
      { unit_type_code: "parking" },
      { unit_type_code: "condo" },
      { unit_type_code: "storage" },
    ]),
    2,
  );
});
