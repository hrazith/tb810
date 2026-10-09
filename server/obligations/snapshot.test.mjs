import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
});
const { buildSnapshotPayload } = jiti("./snapshot.ts");
const { buildChargeMap } = jiti("./owner-facts.ts");

const accounts = new Map([
  ["unit-1", { id: "account-1", unit_id: "unit-1", building_id: "building-1", status: "active" }],
]);

const facts = {
  sourceReadingMonth: "2026-08",
  commonWaterBill: {
    id: "water-bill-1",
    billing_period_id: "source-period-1",
    amount: 2760.5,
    previous_reading: 12146,
    current_reading: 12846,
    total_consumption: 700,
  },
  gasBills: [{ id: "gas-bill-1", processed_at: null, amount: 460 }],
  gasReadings: [{ id: "gas-reading-1", unit_id: "unit-1", reading_month: "2026-08-01", consumption: 12.5 }],
};

const completeComposition = {
  readiness: "ready",
  blockers: [],
  units: [
    {
      unitId: "unit-1",
      unitNumber: "101",
      components: [
        { key: "fixed_assessment", status: "available", amount: "100.00", sourceMonth: "2026-09" },
        { key: "metered_water", status: "available", amount: "20.00", sourceMonth: "2026-08" },
        { key: "common_water", status: "available", amount: "5.00", sourceMonth: "2026-08" },
        { key: "gas", status: "available", amount: "30.00", sourceMonth: "2026-08" },
        {
          key: "other_charge",
          status: "available",
          amount: "25.00",
          sourceMonth: "2026-09",
          lineItems: [{ chargeId: "charge-1", description: "Repair", amount: "25.00", effectiveFromMonth: "2026-09", effectiveToMonth: null }],
        },
      ],
    },
  ],
};

function makeCharge(overrides = {}) {
  return {
    id: "charge-1",
    series_id: "series-1",
    building_id: "building-1",
    unit_id: "unit-1",
    owner_id: null,
    description: "Repair",
    amount: 25,
    schedule: "one_off",
    effective_from_month: "2026-10-01",
    effective_to_month: null,
    stop_note: null,
    legacy_table: null,
    legacy_id: null,
    legacy_metadata: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

test("snapshot charge composition includes charges eligible for the target obligation month", () => {
  const result = buildChargeMap([
    makeCharge(),
    makeCharge({ id: "future", effective_from_month: "2026-11-01" }),
    makeCharge({ id: "expired", effective_from_month: "2026-09-01", effective_to_month: "2026-09-30" }),
  ], "2026-10", ["unit-1"]);

  assert.equal(result.get("unit-1")?.amount, "25.00");
  assert.deepEqual(result.get("unit-1")?.lineItems.map((item) => item.chargeId), ["charge-1"]);
});

test("complete composition maps the canonical component vocabulary and provenance", () => {
  const result = buildSnapshotPayload(
    completeComposition,
    facts,
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.error, null);
  assert.deepEqual(result.data?.rows.map((row) => row.obligation_type), [
    "fixed_assessment",
    "water_consumption",
    "common_water",
    "gas_consumption",
    "other_charge",
  ]);
  assert.deepEqual(result.data?.rows.map((row) => row.source_id), [
    "budget-plan-1",
    "water-reading-1",
    "water-bill-1",
    "gas-bill-1",
    "charge-1",
  ]);
  assert.deepEqual(result.data?.gasBillIds, ["gas-bill-1"]);
  assert.deepEqual(result.data?.rows.map((row) => row.source_service_month), [
    "2026-09-01",
    "2026-08-01",
    "2026-08-01",
    "2026-08-01",
    "2026-09-01",
  ]);
  assert.ok(result.data?.rows.every((row) => row.calculation_snapshot.sourceIds.length > 0));
});

test("owner-direct charges are not materialized by the unit snapshot payload", () => {
  const result = buildSnapshotPayload(
    {
      ...completeComposition,
      units: [{ ...completeComposition.units[0], components: completeComposition.units[0].components.slice(0, 5) }],
    },
    facts,
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.data?.rows.some((row) => row.obligation_type === "owner_direct"), false);
});

test("incomplete composition refuses materialization before persistence", () => {
  const result = buildSnapshotPayload(
    { ...completeComposition, readiness: "blocked", blockers: ["Required gas readings are missing."] },
    facts,
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.data, null);
  assert.equal(result.error, "Required gas readings are missing.");
});

test("missing source provenance refuses an otherwise complete component", () => {
  const result = buildSnapshotPayload(
    completeComposition,
    { ...facts, commonWaterBill: null },
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.data, null);
  // Metered Water is the first Sedapal-dependent component to fail closed.
  assert.equal(result.error, "Missing Sedapal provenance for metered_water on 101.");
});

test("Sedapal-dependent rows persist the exact bill values used for calculation", () => {
  const result = buildSnapshotPayload(
    completeComposition,
    facts,
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.error, null);
  const expected = {
    id: "water-bill-1",
    billingPeriodId: "source-period-1",
    amount: "2760.5",
    previousReading: "12146",
    currentReading: "12846",
    totalConsumption: "700",
  };
  const byType = Object.fromEntries(result.data.rows.map((row) => [row.obligation_type, row.calculation_snapshot]));
  assert.deepEqual(byType.water_consumption.sedapalBill, expected);
  assert.deepEqual(byType.common_water.sedapalBill, expected);
  for (const type of ["fixed_assessment", "gas_consumption", "other_charge"]) {
    assert.equal(byType[type].sedapalBill, undefined, `${type} must not claim Sedapal provenance`);
  }
});

test("Gas rows declare the readings, consumption and supplier pool used for calculation", () => {
  const result = buildSnapshotPayload(
    completeComposition,
    {
      ...facts,
      gasBills: [
        { id: "gas-bill-b", processed_at: null, amount: "460.00" },
        { id: "gas-bill-a", processed_at: null, amount: 459.99 },
      ],
    },
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.error, null);
  const gas = result.data.rows.find((row) => row.obligation_type === "gas_consumption");
  assert.deepEqual(gas.calculation_snapshot.gasProvenance, {
    sourceMonth: "2026-08",
    readingId: "gas-reading-1",
    unitConsumption: "12.5",
    billIds: ["gas-bill-a", "gas-bill-b"],
    poolTotal: "919.99",
  });
  for (const type of ["fixed_assessment", "water_consumption", "common_water", "other_charge"]) {
    const row = result.data.rows.find((candidate) => candidate.obligation_type === type);
    assert.equal(row.calculation_snapshot.gasProvenance, undefined, `${type} must not claim Gas provenance`);
  }
});

test("an empty supplier pool still declares Gas provenance", () => {
  const result = buildSnapshotPayload(completeComposition, { ...facts, gasBills: [] }, accounts, "budget-plan-1", new Map([["unit-1", "water-reading-1"]]));
  assert.equal(result.error, null);
  const gas = result.data.rows.find((row) => row.obligation_type === "gas_consumption");
  assert.deepEqual(gas.calculation_snapshot.gasProvenance.billIds, []);
  assert.equal(gas.calculation_snapshot.gasProvenance.poolTotal, "0.00");
});

test("a Gas row without its source reading refuses materialization", () => {
  const result = buildSnapshotPayload(completeComposition, { ...facts, gasReadings: [] }, accounts, "budget-plan-1", new Map([["unit-1", "water-reading-1"]]));
  assert.equal(result.data, null);
  assert.equal(result.error, "Missing Gas provenance for 101.");
});

test("Sedapal provenance preserves string values from the facts read", () => {
  const result = buildSnapshotPayload(
    completeComposition,
    { ...facts, commonWaterBill: { ...facts.commonWaterBill, amount: "2760.50", total_consumption: "700.000" } },
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  const commonWater = result.data.rows.find((row) => row.obligation_type === "common_water");
  assert.equal(commonWater.calculation_snapshot.sedapalBill.amount, "2760.50");
  assert.equal(commonWater.calculation_snapshot.sedapalBill.totalConsumption, "700.000");
});

test("incomplete Sedapal provenance refuses materialization before persistence", () => {
  for (const missing of ["billing_period_id", "amount", "previous_reading", "current_reading", "total_consumption"]) {
    const bill = { ...facts.commonWaterBill };
    delete bill[missing];
    const result = buildSnapshotPayload(
      completeComposition,
      { ...facts, commonWaterBill: bill },
      accounts,
      "budget-plan-1",
      new Map([["unit-1", "water-reading-1"]]),
    );

    assert.equal(result.data, null, `missing ${missing}`);
    assert.equal(result.failureKind, "not_ready");
    assert.equal(result.error, "Missing Sedapal provenance for metered_water on 101.");
  }
});

test("non-Gas condo units do not require Gas provenance", () => {
  const result = buildSnapshotPayload(
    {
      ...completeComposition,
      units: [{
        ...completeComposition.units[0],
        unitNumber: "301",
        components: completeComposition.units[0].components.filter((component) => component.key !== "gas"),
      }],
    },
    { ...facts, gasBills: [], gasReadings: [] },
    accounts,
    "budget-plan-1",
    new Map([["unit-1", "water-reading-1"]]),
  );

  assert.equal(result.error, null);
  assert.ok(result.data?.rows.every((row) => row.obligation_type !== "gas_consumption"));
});
