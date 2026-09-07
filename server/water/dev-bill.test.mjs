import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});
const { buildCommonWaterBillDraft, findLatestValidWaterSource } = jiti("./dev-bill.ts");
const { hasCompleteWaterReadings } = jiti("./readiness.ts");

test("derives Sedapal consumption from current readings plus prior common water", () => {
  const result = buildCommonWaterBillDraft({
    billDate: "2026-08-31",
    currentUnitConsumptionMilli: 700000n,
    priorSource: {
      unitConsumptionMilli: 450000n,
      commonConsumptionMilli: 50000n,
      bill: {
        amount: "3000.00",
        bill_date: "2026-07-31",
        current_reading: "124.000",
        previous_reading: "100.000",
        total_consumption: "500.000",
        created_at: "2026-07-31T12:00:00Z",
      },
    },
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.data, {
    amount: "4500.00",
    billDate: "2026-08-31",
    currentReading: 874,
    previousReading: 124,
    description: "Sedapal test bill",
  });
});

test("requires a prior valid Sedapal/Common Water period", () => {
  const result = buildCommonWaterBillDraft({
    billDate: "2026-08-31",
    currentUnitConsumptionMilli: 700000n,
    priorSource: null,
  });

  assert.equal(result.data, null);
  assert.match(result.error ?? "", /prior valid Sedapal\/Common Water period/);
});

test("selects the latest prior complete valid billing period", () => {
  const result = findLatestValidWaterSource({
    billDate: "2026-08-31",
    eligibleUnitIds: new Set(["u1", "u2"]),
    history: [
      { amount: "3000.00", bill_date: "2026-08-02", billing_period: { period_year: 2026, period_month: 7 }, current_reading: "124", previous_reading: "100", total_consumption: "500", created_at: "2026-08-02T00:00:00Z" },
      { amount: "2500.00", bill_date: "2026-07-02", billing_period: { period_year: 2026, period_month: 6 }, current_reading: "100", previous_reading: "70", total_consumption: "400", created_at: "2026-07-02T00:00:00Z" },
    ],
    readings: [
      { unit_id: "u1", reading_month: "2026-07-01", consumption: 250 },
      { unit_id: "u2", reading_month: "2026-07-01", consumption: 250 },
      { unit_id: "u1", reading_month: "2026-06-01", consumption: 180 },
      { unit_id: "u2", reading_month: "2026-06-01", consumption: 180 },
    ],
  });

  assert.equal(result.bill.bill_date, "2026-08-02");
  assert.equal(result.unitConsumptionMilli, 500000n);
  assert.equal(result.commonConsumptionMilli, 0n);
});

test("rejects invalid current consumption instead of coercing it to zero", () => {
  const result = buildCommonWaterBillDraft({
    billDate: "2026-08-31",
    currentUnitConsumptionMilli: -1n,
    priorSource: {
      unitConsumptionMilli: 450000n,
      commonConsumptionMilli: 0n,
      bill: { amount: "3000", bill_date: "2026-07-31", current_reading: "124", previous_reading: "100", total_consumption: "500", created_at: "2026-07-31T00:00:00Z" },
    },
  });

  assert.equal(result.data, null);
  assert.match(result.error ?? "", /valid Sedapal reading baseline/);
});

test("water readiness rejects incomplete canonical readings", () => {
  assert.equal(hasCompleteWaterReadings({
    eligibleUnitIds: ["u1", "u2"],
    readings: [{ unit_id: "u1", reading_end: 10, consumption: 1 }],
  }), false);
});

test("water readiness accepts complete canonical readings", () => {
  assert.equal(hasCompleteWaterReadings({
    eligibleUnitIds: ["u1", "u2"],
    readings: [
      { unit_id: "u1", reading_end: 10, consumption: 1 },
      { unit_id: "u2", reading_end: 20, consumption: 2 },
    ],
  }), true);
});
