const test = require("node:test");
const assert = require("node:assert/strict");
const createJiti = require("jiti");

const jiti = createJiti(__filename);
const { composeMonthlyObligation } = jiti("./core.ts");

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

function makeProviders(overrides = {}) {
  return {
    fixed_assessment: async () => ({
      status: "available",
      amount: "10.00",
      currency: "PEN",
      sourceMonth: "2026-08",
      provenance: "fixed",
    }),
    metered_water: async () => ({
      status: "available",
      amount: "5.00",
      currency: "PEN",
      sourceMonth: "2026-08",
      provenance: "water",
    }),
    common_water: async () => ({
      status: "available",
      amount: "2.00",
      currency: "PEN",
      sourceMonth: "2026-08",
      provenance: "water",
    }),
    ...overrides,
  };
}

test("complete obligation composes all available components", async () => {
  const result = await composeMonthlyObligation(baseContext, [makeUnit()], makeProviders());

  assert.equal(result.knownTotal, "17.00");
  assert.equal(result.readiness, "ready");
  assert.deepEqual(result.missingComponents, []);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.units[0].components.length, 3);
});

test("missing water leaves the obligation in progress and excludes it from totals", async () => {
  const result = await composeMonthlyObligation(
    baseContext,
    [makeUnit()],
    makeProviders({
      metered_water: async () => ({
        status: "missing",
        blocker: "Sedapal water bill has not been entered yet.",
        provenance: "water",
        sourceMonth: "2026-08",
      }),
    }),
  );

  assert.equal(result.knownTotal, "12.00");
  assert.equal(result.readiness, "in_progress");
  assert.deepEqual(result.missingComponents, ["metered_water"]);
  assert.deepEqual(result.blockers, ["Sedapal water bill has not been entered yet."]);
});

test("missing common water leaves the obligation in progress and keeps assessed amounts", async () => {
  const result = await composeMonthlyObligation(
    baseContext,
    [makeUnit()],
    makeProviders({
      common_water: async () => ({
        status: "missing",
        blocker: "Cannot be calculated because unit meter readings are incomplete.",
        provenance: "water",
        sourceMonth: "2026-08",
      }),
    }),
  );

  assert.equal(result.knownTotal, "15.00");
  assert.equal(result.readiness, "in_progress");
  assert.deepEqual(result.missingComponents, ["common_water"]);
});

test("assessment only can be fully ready when other components are not applicable", async () => {
  const result = await composeMonthlyObligation(
    baseContext,
    [makeUnit({ unitTypeCode: "parking", hasMeter: false })],
    makeProviders({
      metered_water: async () => ({ status: "not_applicable", provenance: "water", sourceMonth: "2026-08" }),
      common_water: async () => ({ status: "not_applicable", provenance: "water", sourceMonth: "2026-08" }),
    }),
  );

  assert.equal(result.knownTotal, "10.00");
  assert.equal(result.readiness, "ready");
  assert.deepEqual(result.missingComponents, []);
});

test("zero amounts remain distinct from missing components", async () => {
  const result = await composeMonthlyObligation(
    baseContext,
    [makeUnit()],
    makeProviders({
      fixed_assessment: async () => ({
        status: "available",
        amount: "0.00",
        currency: "PEN",
        sourceMonth: "2026-08",
        provenance: "fixed",
      }),
      metered_water: async () => ({
        status: "missing",
        blocker: "Sedapal water bill has not been entered yet.",
        provenance: "water",
        sourceMonth: "2026-08",
      }),
      common_water: async () => ({
        status: "not_applicable",
        provenance: "water",
        sourceMonth: "2026-08",
      }),
    }),
  );

  assert.equal(result.knownTotal, "0.00");
  assert.deepEqual(result.missingComponents, ["metered_water"]);
});

test("repeated reads are idempotent", async () => {
  const providers = makeProviders();
  const units = [makeUnit(), makeUnit({ unitId: "unit-2", unitNumber: "102", unitAccountId: "account-2" })];

  const first = await composeMonthlyObligation(baseContext, units, providers);
  const second = await composeMonthlyObligation(baseContext, units, providers);

  assert.deepEqual(first, second);
});

