import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});
const { buildMonthlyObligationSummary } = jiti("./summary.ts");
const { selectBuildingOwnerDirectCharges } = jiti("./index.ts");

test("zero applicable other charges are available with a zero amount in the building summary", () => {
  const summary = buildMonthlyObligationSummary({
    obligationMonth: "2026-08",
    eligibleUnitCount: 64,
    fixedAssessment: { state: "available", amount: "21996.48" },
    meteredWater: { state: "available", amount: "2508.77" },
    commonWater: { state: "available", amount: "7.51" },
    gas: { state: "available", amount: "2760.00" },
    otherChargeAmount: "0.00",
    otherChargeCount: 0,
    ownerDirectChargeAmount: "0.00",
    ownerDirectChargeCount: 0,
  });

  assert.equal(summary.components.other_charge.state, "available");
  assert.equal(summary.components.other_charge.amount, "0.00");
  assert.equal(summary.components.other_charge.count, 0);
  assert.equal(summary.total, "27272.76");
});

test("owner-direct charges are filtered separately from unit charges and respect eligibility windows", () => {
  const charges = [
    { amount: 100, schedule: "one_off", effective_from_month: "2026-09-01", effective_to_month: null, owner_id: "owner-1", unit_id: null },
    { amount: 125, schedule: "one_off", effective_from_month: "2026-10-01", effective_to_month: null, owner_id: "owner-1", unit_id: null },
    { amount: 50, schedule: "recurring", effective_from_month: "2026-08-01", effective_to_month: "2026-09-01", owner_id: "owner-1", unit_id: null },
    { amount: 30, schedule: "one_off", effective_from_month: "2026-09-01", effective_to_month: null, owner_id: null, unit_id: "unit-1" },
    { amount: 20, schedule: "one_off", effective_from_month: "2026-09-01", effective_to_month: null, owner_id: "owner-2", unit_id: null },
  ];

  const september = selectBuildingOwnerDirectCharges(charges, "2026-09");
  assert.deepEqual(september.map((row) => row.amount), [100, 50, 20]);

  const october = selectBuildingOwnerDirectCharges(charges, "2026-10");
  assert.deepEqual(october.map((row) => row.amount), [125]);
});

test("owner-direct charge is included exactly once in the building total when the summary is ready", () => {
  const summary = buildMonthlyObligationSummary({
    obligationMonth: "2026-09",
    eligibleUnitCount: 64,
    fixedAssessment: { state: "available", amount: "21996.48" },
    meteredWater: { state: "available", amount: "2508.77" },
    commonWater: { state: "available", amount: "7.51" },
    gas: { state: "available", amount: "2760.00" },
    otherChargeAmount: "0.00",
    otherChargeCount: 0,
    ownerDirectChargeAmount: "100.00",
    ownerDirectChargeCount: 1,
  });

  assert.equal(summary.components.owner_direct_charge.state, "available");
  assert.equal(summary.components.owner_direct_charge.amount, "100.00");
  assert.equal(summary.total, "27372.76");
});

test("owner-direct charge remains visible even when another required component is blocked", () => {
  const summary = buildMonthlyObligationSummary({
    obligationMonth: "2026-09",
    eligibleUnitCount: 64,
    fixedAssessment: { state: "available", amount: "21996.48" },
    meteredWater: { state: "available", amount: "2508.77" },
    commonWater: { state: "blocked", amount: null, reason: "Common water unavailable." },
    gas: { state: "available", amount: "2760.00" },
    otherChargeAmount: "0.00",
    otherChargeCount: 0,
    ownerDirectChargeAmount: "100.00",
    ownerDirectChargeCount: 1,
  });

  assert.equal(summary.components.owner_direct_charge.amount, "100.00");
  assert.equal(summary.total, null);
});
