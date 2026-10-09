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

test("gas bills are eligible only when explicitly selected for the obligation month", () => {
  const available = { selected_obligation_month: null, processed_at: null, reserved_billing_period_id: null };
  const selected = { ...available, selected_obligation_month: "2026-08-01" };
  assert.equal(isEligibleGasBill(selected, "2026-08"), true);
  assert.equal(isEligibleGasBill(available, "2026-08"), false);
  assert.equal(isEligibleGasBill(selected, "2026-09"), false);
  assert.equal(isEligibleGasBill({ ...selected, processed_at: "2026-08-05" }, "2026-08"), false);
  assert.equal(isEligibleGasBill({ ...selected, reserved_billing_period_id: "period" }, "2026-08"), false);
});
