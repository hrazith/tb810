import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
});
const { buildSnapshotPayload } = jiti("./snapshot.ts");

const accounts = new Map([
  ["unit-1", { id: "account-1", unit_id: "unit-1", building_id: "building-1", status: "active" }],
]);

const facts = {
  sourceReadingMonth: "2026-08",
  commonWaterBill: { id: "water-bill-1" },
  gasBills: [{ id: "gas-bill-1", processed_at: null }],
  gasReadings: [{ id: "gas-reading-1" }],
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
  assert.equal(result.error, "Missing provenance for common_water on 101.");
});
