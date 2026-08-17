import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});
const { selectUpcomingChargesForTarget } = jiti("./index.ts");

function makeCharge(overrides = {}) {
  return {
    id: "charge-1",
    series_id: "series-1",
    building_id: "building-1",
    unit_id: "unit-1",
    owner_id: null,
    description: "Laundry",
    amount: 30,
    schedule: "one_off",
    effective_from_month: "2026-09-01",
    effective_to_month: null,
    stop_note: null,
    legacy_table: null,
    legacy_id: null,
    legacy_metadata: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

test("upcoming unit charges respect month cutoff and target ownership", () => {
  const charges = [
    makeCharge({ id: "unit-sep", effective_from_month: "2026-09-01" }),
    makeCharge({ id: "unit-aug", effective_from_month: "2026-08-01" }),
    makeCharge({ id: "owner-sep", unit_id: null, owner_id: "owner-1", id: "owner-sep" }),
    makeCharge({ id: "other-unit", unit_id: "unit-2" }),
    makeCharge({ id: "recurring-sep", id: "recurring-sep", schedule: "recurring", effective_to_month: "2026-12-01" }),
  ];

  const result = selectUpcomingChargesForTarget(charges, { unitId: "unit-1" }, "2026-08");

  assert.deepEqual(result.map((charge) => charge.id), ["unit-sep", "recurring-sep"]);

  const september = selectUpcomingChargesForTarget(charges, { unitId: "unit-1" }, "2026-09");
  assert.deepEqual(september.map((charge) => charge.id), []);
});

test("upcoming owner-direct charges exclude unit-targeted rows and keep future-only owner rows", () => {
  const charges = [
    makeCharge({ id: "owner-sep", unit_id: null, owner_id: "owner-1" }),
    makeCharge({ id: "owner-aug", unit_id: null, owner_id: "owner-1", effective_from_month: "2026-08-01" }),
    makeCharge({ id: "unit-sep", unit_id: "unit-1", owner_id: null }),
    makeCharge({ id: "owner-other", unit_id: null, owner_id: "owner-2" }),
  ];

  const result = selectUpcomingChargesForTarget(charges, { ownerId: "owner-1" }, "2026-08");

  assert.deepEqual(result.map((charge) => charge.id), ["owner-sep"]);
});
