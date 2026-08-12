import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
  defaultStartMonthForNewCharge,
  isChargeEligibleForMonth,
  nextMonthKey,
} = jiti("./month.ts");

test("one-off charge only applies to its exact month", () => {
  const charge = {
    schedule: "one_off",
    effectiveFromMonth: "2026-09",
    effectiveToMonth: null,
  };

  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-08" }), false);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-09" }), true);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-10" }), false);
});

test("recurring charge spans its effective range", () => {
  const charge = {
    schedule: "recurring",
    effectiveFromMonth: "2026-09",
    effectiveToMonth: "2026-11",
  };

  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-08" }), false);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-09" }), true);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-10" }), true);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-11" }), true);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-12" }), false);
});

test("open-ended recurring charge stays active until stopped", () => {
  const charge = {
    schedule: "recurring",
    effectiveFromMonth: "2026-09",
    effectiveToMonth: null,
  };

  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2026-09" }), true);
  assert.equal(isChargeEligibleForMonth({ ...charge, obligationMonth: "2027-01" }), true);
});

test("default start month advances one month past the reference month", () => {
  assert.equal(defaultStartMonthForNewCharge("2026-08"), "2026-09");
  assert.equal(nextMonthKey("2026-08"), "2026-09");
});
