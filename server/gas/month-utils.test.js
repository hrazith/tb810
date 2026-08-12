/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const createJiti = require("jiti");

const jiti = createJiti(__filename);
const { previousMonthKeyFromMonthKey, isEligibleGasBill } = jiti("./month-utils.ts");

test("obligation month 2026-08 derives source reading month 2026-07", () => {
  assert.equal(previousMonthKeyFromMonthKey("2026-08"), "2026-07");
});

test("obligation month 2026-09 derives source reading month 2026-08", () => {
  assert.equal(previousMonthKeyFromMonthKey("2026-09"), "2026-08");
});

test("obligation month 2027-01 derives source reading month 2026-12", () => {
  assert.equal(previousMonthKeyFromMonthKey("2027-01"), "2026-12");
});

test("gas bills are eligible when unprocessed and before the obligation month boundary", () => {
  assert.equal(isEligibleGasBill("2026-07-31", null, "2026-08"), true);
  assert.equal(isEligibleGasBill("2026-08-01", null, "2026-08"), false);
  assert.equal(isEligibleGasBill("2026-07-31", "2026-08-05", "2026-08"), false);
});
