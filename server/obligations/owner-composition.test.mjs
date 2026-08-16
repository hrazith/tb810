import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { composeOwnerMonthlyObligation } = jiti("./owner-composition.ts");

function makeUnit(overrides = {}) {
  return {
    unitId: "unit-1",
    unitNumber: "101",
    unitAccountId: "account-1",
    components: [
      { key: "fixed_assessment", label: "Fixed Monthly Assessment", status: "available", amount: "10.00", currency: "PEN", sourceMonth: "2026-08", provenance: "fixed", blocker: null },
    ],
    knownTotal: "10.00",
    readiness: "ready",
    missingComponents: [],
    blockers: [],
    ...overrides,
  };
}

test("owner-direct charges are available with zero amount when none apply", () => {
  const result = composeOwnerMonthlyObligation({
    ownerId: "owner-1",
    ownerReference: "OWN-000001",
    ownerName: "Test Owner",
    obligationMonth: "2026-08",
    units: [],
    ownerDirectCharges: { state: "available", amount: "0.00", count: 0, reason: null, lineItems: [] },
  });

  assert.equal(result.ownerDirectCharges.state, "available");
  assert.equal(result.ownerDirectCharges.amount, "0.00");
  assert.equal(result.ownerDirectCharges.count, 0);
  assert.equal(result.total.state, "available");
  assert.equal(result.total.amount, "0.00");
});

test("owner total sums multiple units once and includes owner-direct charges", () => {
  const result = composeOwnerMonthlyObligation({
    ownerId: "owner-1",
    ownerReference: "OWN-000001",
    ownerName: "Test Owner",
    obligationMonth: "2026-08",
    units: [makeUnit({ unitId: "unit-1", knownTotal: "10.00" }), makeUnit({ unitId: "unit-2", knownTotal: "15.50" })],
    ownerDirectCharges: { state: "available", amount: "4.50", count: 1, reason: null, lineItems: [] },
  });

  assert.equal(result.total.amount, "30.00");
  assert.equal(result.readiness, "ready");
});

test("mixed unit types remain part of the same owner consolidation", () => {
  const result = composeOwnerMonthlyObligation({
    ownerId: "owner-1",
    ownerReference: "OWN-000001",
    ownerName: "Test Owner",
    obligationMonth: "2026-08",
    units: [
      makeUnit({ unitId: "condo-1", knownTotal: "10.00" }),
      makeUnit({ unitId: "parking-1", unitNumber: "EST-1", knownTotal: "2.00" }),
      makeUnit({ unitId: "storage-1", unitNumber: "DEPOS-1", knownTotal: "3.00" }),
    ],
    ownerDirectCharges: { state: "available", amount: "0.00", count: 0, reason: null, lineItems: [] },
  });

  assert.equal(result.total.amount, "15.00");
  assert.equal(result.units.length, 3);
});

test("blocked constituent unit blocks the owner total", () => {
  const result = composeOwnerMonthlyObligation({
    ownerId: "owner-1",
    ownerReference: "OWN-000001",
    ownerName: "Test Owner",
    obligationMonth: "2026-08",
    units: [
      makeUnit({ unitId: "unit-1", knownTotal: "10.00" }),
      makeUnit({ unitId: "unit-2", knownTotal: "15.00", readiness: "blocked", blockers: ["Water unavailable"], missingComponents: ["metered_water"] }),
    ],
    ownerDirectCharges: { state: "available", amount: "0.00", count: 0, reason: null, lineItems: [] },
  });

  assert.equal(result.total.state, "blocked");
  assert.equal(result.total.amount, null);
  assert.equal(result.readiness, "blocked");
});

test("duplicate unit totals are not double counted when input already collapses to one unit", () => {
  const result = composeOwnerMonthlyObligation({
    ownerId: "owner-1",
    ownerReference: "OWN-000001",
    ownerName: "Test Owner",
    obligationMonth: "2026-08",
    units: [makeUnit({ knownTotal: "10.00" })],
    ownerDirectCharges: { state: "available", amount: "0.00", count: 0, reason: null, lineItems: [] },
  });

  assert.equal(result.total.amount, "10.00");
});
