import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});
const {
  normalizeUnitWorkspaceMonthFactsResponse,
  buildWaterWorkspaceContextFromFacts,
  buildGasCalculationInputFromFacts,
} = jiti("./unit-workspace.ts");

test("RPC failure is not normalized into empty financial facts", () => {
  const result = normalizeUnitWorkspaceMonthFactsResponse(
    { data: null, error: { message: "function missing" } },
    2026,
  );

  assert.equal(result.error, "function missing");
  assert.deepEqual(result.plan, null);
  assert.deepEqual(result.charges, []);
  assert.deepEqual(result.readings, []);
  assert.deepEqual(result.gasBills, []);
  assert.deepEqual(result.gasReadings, []);
  assert.deepEqual(result.unitRows, []);
});

test("successful empty payload remains a valid empty business result", () => {
  const result = normalizeUnitWorkspaceMonthFactsResponse({ data: {}, error: null }, 2026);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.plan, null);
  assert.deepEqual(result.commonWaterBill, null);
  assert.deepEqual(result.charges, []);
  assert.deepEqual(result.bills, []);
  assert.deepEqual(result.readings, []);
  assert.deepEqual(result.gasBills, []);
  assert.deepEqual(result.gasReadings, []);
  assert.deepEqual(result.unitRows, []);
});

test("water context keeps only condo population and source-month readings", () => {
  const unit = {
    id: "u-201",
    unit_type_id: "type-condo",
    unit_number: "201",
    unit_type_code: "condo",
    has_meter: true,
  };
  const facts = {
    plan: null,
    commonWaterType: { id: "cw", code: "common_water", name: "Common Water" },
    commonWaterBill: null,
    charges: [],
    bills: [],
    readings: [
      { unit_id: "u-201", reading_end: 10, consumption: 2, reading_date: "2026-07-05", created_at: "2026-08-01T00:00:00Z" },
      { unit_id: "u-201", reading_end: 11, consumption: 3, reading_date: "2026-06-05", created_at: "2026-07-01T00:00:00Z" },
      { unit_id: "u-202", reading_end: 7, consumption: 1, reading_date: "2026-07-05", created_at: "2026-08-01T00:00:00Z" },
    ],
    gasBills: [],
    gasReadings: [],
    unitRows: [
      { id: "u-201", unit_type_id: "type-condo", unit_type_code: "condo", unit_number: "201", has_gas_service: true, has_meter: true },
      { id: "u-202", unit_type_id: "type-parking", unit_type_code: "parking", unit_number: "P1", has_gas_service: false, has_meter: false },
    ],
    planYear: 2026,
  };

  const context = buildWaterWorkspaceContextFromFacts(unit, "2026-08", facts);

  assert.deepEqual(context.eligibleUnitIds, ["u-201"]);
  assert.equal(context.readingsByUnit.has("u-201"), true);
  assert.equal(context.readingsByUnit.get("u-201")?.length ?? 0, 1);
  assert.equal(context.readingsByUnit.get("u-201")?.[0].consumption, 2);
});

test("gas calculation input joins consumption by unit id from the RPC payload", () => {
  const facts = {
    plan: null,
    commonWaterType: null,
    commonWaterBill: null,
    charges: [],
    bills: [],
    readings: [],
    gasBills: [
      { id: "bill-1", amount: 460, processed_at: null },
    ],
    gasReadings: [
      { unit_id: "u-201", reading_month: "2026-07-01", current_reading: 275.154, previous_reading: 275.06, consumption: 0.094 },
      { unit_id: "u-202", reading_month: "2026-07-01", current_reading: 100, previous_reading: 99, consumption: 1 },
    ],
    unitRows: [
      { id: "u-201", unit_type_id: "type-condo", unit_type_code: "condo", unit_number: "201", has_gas_service: true, has_meter: true },
      { id: "u-202", unit_type_id: "type-parking", unit_type_code: "parking", unit_number: "P1", has_gas_service: false, has_meter: false },
    ],
    planYear: 2026,
  };

  const input = buildGasCalculationInputFromFacts(facts, "2026-08");

  assert.equal(input.units.find((unit) => unit.unitId === "u-201")?.consumption, "0.094");
  assert.equal(input.units.find((unit) => unit.unitId === "u-201")?.unitTypeCode, "condo");
  assert.equal(input.units.find((unit) => unit.unitId === "u-202")?.unitTypeCode, "parking");
  assert.equal(input.supplierBills.length, 1);
});
