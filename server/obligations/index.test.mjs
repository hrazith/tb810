import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { buildMonthlyObligationSummary } = jiti("./summary.ts");

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
  });

  assert.equal(summary.components.other_charge.state, "available");
  assert.equal(summary.components.other_charge.amount, "0.00");
  assert.equal(summary.components.other_charge.count, 0);
  assert.equal(summary.total, "27272.76");
});
