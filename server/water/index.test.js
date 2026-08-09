/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const createJiti = require("jiti");

const jiti = createJiti(__filename);
const { previousMonthKeyFromMonthKey, countCommonWaterCondoUnits } = jiti("./month-utils.ts");

test("obligation month 2026-08 derives source reading month 2026-07", () => {
  assert.equal(previousMonthKeyFromMonthKey("2026-08"), "2026-07");
});

test("obligation month 2026-09 derives source reading month 2026-08", () => {
  assert.equal(previousMonthKeyFromMonthKey("2026-09"), "2026-08");
});

test("obligation month 2027-01 derives source reading month 2026-12", () => {
  assert.equal(previousMonthKeyFromMonthKey("2027-01"), "2026-12");
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
