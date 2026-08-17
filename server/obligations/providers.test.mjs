import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const aliasedJiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});
const { MONTHLY_OBLIGATION_PROVIDER_KEYS } = jiti("./provider-keys.ts");
const { createMonthlyObligationProviders } = aliasedJiti("./providers.ts");

const baseContext = {
  obligationMonth: "2026-08",
  buildingId: "building-1",
  buildingName: "Tower One",
};

function makeUnit(overrides = {}) {
  return {
    unitId: "unit-1",
    unitNumber: "101",
    unitAccountId: "account-1",
    unitTypeCode: "condo",
    hasMeter: true,
    participationPercentage: 0.1,
    ...overrides,
  };
}

test("monthly obligation provider factory exposes all canonical components", () => {
  assert.deepEqual(MONTHLY_OBLIGATION_PROVIDER_KEYS, [
    "fixed_assessment",
    "metered_water",
    "common_water",
    "gas",
    "other_charge",
  ]);
});

test("parking and storage short-circuit water and gas providers before expensive helpers", async () => {
  let waterCalls = 0;
  let gasCalls = 0;
  const providers = createMonthlyObligationProviders({
    getWaterChargePreviewsForUnit: async () => {
      waterCalls += 1;
      return {
        meteredWater: { status: "available", data: { amount: "1.00" } },
        commonWater: { status: "available", data: { unitCommonWaterCharge: "1.00" } },
      };
    },
    getGasChargePreviewsForUnit: async () => {
      gasCalls += 1;
      return {
        status: "available",
        data: { unitCharges: [{ unitId: "unit-1", amount: "1.00" }], sourceReadingMonth: "2026-07" },
      };
    },
  });

  const parkingUnit = makeUnit({ unitTypeCode: "parking", hasMeter: false });
  const storageUnit = makeUnit({ unitTypeCode: "storage", hasMeter: false });

  const parkingMeteredWater = await providers.metered_water({ context: baseContext, unit: parkingUnit });
  const parkingCommonWater = await providers.common_water({ context: baseContext, unit: parkingUnit });
  const parkingGas = await providers.gas({ context: baseContext, unit: parkingUnit });

  const storageMeteredWater = await providers.metered_water({ context: baseContext, unit: storageUnit });
  const storageCommonWater = await providers.common_water({ context: baseContext, unit: storageUnit });
  const storageGas = await providers.gas({ context: baseContext, unit: storageUnit });

  assert.equal(parkingMeteredWater.status, "not_applicable");
  assert.equal(parkingCommonWater.status, "not_applicable");
  assert.equal(parkingGas.status, "not_applicable");
  assert.equal(storageMeteredWater.status, "not_applicable");
  assert.equal(storageCommonWater.status, "not_applicable");
  assert.equal(storageGas.status, "not_applicable");
  assert.equal(waterCalls, 0);
  assert.equal(gasCalls, 0);
});

test("condo provider paths still call the expensive helpers normally", async () => {
  let waterCalls = 0;
  let gasCalls = 0;
  const providers = createMonthlyObligationProviders({
    getWaterChargePreviewsForUnit: async () => {
      waterCalls += 1;
      return {
        meteredWater: { status: "available", data: { amount: "1.00" } },
        commonWater: { status: "available", data: { unitCommonWaterCharge: "1.00" } },
      };
    },
    getGasChargePreviewsForUnit: async () => {
      gasCalls += 1;
      return {
        status: "available",
        data: { unitCharges: [{ unitId: "unit-1", amount: "1.00" }], sourceReadingMonth: "2026-07" },
      };
    },
  });

  const condoUnit = makeUnit();

  await providers.metered_water({ context: baseContext, unit: condoUnit });
  await providers.common_water({ context: baseContext, unit: condoUnit });
  await providers.gas({ context: baseContext, unit: condoUnit });

  assert.equal(waterCalls, 2);
  assert.equal(gasCalls, 1);
});
