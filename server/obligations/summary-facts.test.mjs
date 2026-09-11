import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { buildMonthlyObligationSummaryFromFacts, buildMonthlyObligationSummaryFromSnapshot } = jiti("./summary-facts.ts");

test("building Common Water summary sums each participating unit obligation", () => {
  const facts = {
    obligationMonth: "2026-09",
    sourceReadingMonth: "2026-08",
    planYear: 2026,
    plan: { currency: "PEN", monthly_operating_budget: "1000.00" },
    commonWaterType: { id: "common-water", code: "common_water", name: "Common Water" },
    commonWaterBill: { amount: "10.00", total_consumption: "3.000" },
    unitRows: [
      { id: "unit-1", unit_number: "101", unit_type_id: "condo", unit_type_code: "condo", has_meter: true, has_gas_service: true, participation_percentage: 50 },
      { id: "unit-2", unit_number: "102", unit_type_id: "condo", unit_type_code: "condo", has_meter: true, has_gas_service: true, participation_percentage: 50 },
    ],
    waterReadings: [
      { unit_id: "unit-1", reading_end: 2, consumption: 1, reading_date: "2026-08-31", created_at: "2026-08-31T00:00:00Z" },
      { unit_id: "unit-2", reading_end: 2, consumption: 1, reading_date: "2026-08-31", created_at: "2026-08-31T00:00:00Z" },
    ],
    gasBills: [{ id: "gas-bill-1", amount: "10.00", processed_at: null, invoice_date: "2026-08-01" }],
    gasReadings: [
      { unit_id: "unit-1", reading_month: "2026-08-01", current_reading: 1, previous_reading: 0, consumption: 1 },
      { unit_id: "unit-2", reading_month: "2026-08-01", current_reading: 1, previous_reading: 0, consumption: 1 },
    ],
    charges: [],
  };

  const summary = buildMonthlyObligationSummaryFromFacts(facts, "2026-09");

  assert.equal(summary.components.common_water.amount, "3.34");
  assert.equal(summary.total, "1020.00");
});

test("snapshotted building summary uses persisted component totals", () => {
  const facts = {
    unitRows: [{ id: "unit-1", unit_type_code: "condo" }],
    charges: [],
  };
  const snapshot = {
    billingPeriodId: "period-1",
    status: "ready_for_review",
    components: {
      fixed_assessment: { amount: "100.00", count: 1 },
      water_consumption: { amount: "20.00", count: 1 },
      common_water: { amount: "3.25", count: 1 },
      gas_consumption: { amount: "30.00", count: 1 },
      other_charge: { amount: "25.00", count: 1 },
    },
    total: "178.25",
  };

  const summary = buildMonthlyObligationSummaryFromSnapshot(facts, "2026-09", snapshot);

  assert.equal(summary.components.common_water.amount, "3.25");
  assert.equal(summary.total, "178.25");
});
