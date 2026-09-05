import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});

const {
  buildDevUnitChargeFixture,
  selectDevUnitChargeTarget,
} = jiti("./dev-unit-charge.ts");

test("selects the first active condo unit for the DEV charge fixture", () => {
  const target = selectDevUnitChargeTarget([
    { id: "parking-1", unit_number: "P1", unit_type_code: "parking", active: true },
    { id: "condo-2", unit_number: "102", unit_type_code: "condo", active: false },
    { id: "condo-1", unit_number: "101", unit_type_code: "condo", active: true },
    { id: "condo-3", unit_number: "103", unit_type_code: "condo", active: true },
  ]);

  assert.equal(target?.id, "condo-1");
  assert.equal(target?.unit_number, "101");
});

test("falls back to any condo unit when no active condo is available", () => {
  const target = selectDevUnitChargeTarget([
    { id: "parking-1", unit_number: "P1", unit_type_code: "parking", active: true },
    { id: "condo-2", unit_number: "102", unit_type_code: "condo", active: false },
    { id: "condo-1", unit_number: "101", unit_type_code: "condo", active: false },
  ]);

  assert.equal(target?.id, "condo-2");
});

test("builds a deterministic September one-off charge fixture", () => {
  const fixtureA = buildDevUnitChargeFixture({
    buildingId: "building-1",
    unitId: "unit-1",
    unitNumber: "101",
    currentMonth: "2026-08",
  });
  const fixtureB = buildDevUnitChargeFixture({
    buildingId: "building-1",
    unitId: "unit-1",
    unitNumber: "101",
    currentMonth: "2026-08",
  });

  assert.equal(fixtureA.upcomingMonth, "2026-09");
  assert.equal(fixtureA.startsMonth, "2026-09");
  assert.equal(fixtureA.schedule, "one_off");
  assert.equal(fixtureA.description, "DEV test charge for Unit 101");
  assert.equal(fixtureA.amount, 25);
  assert.equal(fixtureA.seriesId, fixtureB.seriesId);
});
