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

test("legacy provenance alone does not lock a live Sedapal bill", () => {
  assert.equal(
    isCommonWaterBillEditable({ consuming_package_status: "collecting_readings" }),
    true,
  );
});

test("Sedapal bills remain editable through handoff before approval", () => {
  assert.equal(
    isCommonWaterBillEditable({ consuming_package_status: "ready_for_review" }),
    true,
  );
});

test("Sedapal bills become immutable after Carlos approval", () => {
  for (const status of ["approved", "invoices_generated", "closed"]) {
    assert.equal(isCommonWaterBillEditable({ consuming_package_status: status }), false);
  }
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
