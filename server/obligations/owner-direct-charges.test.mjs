import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd()) } });
const { buildOwnerDirectCharges } = jiti("./owner-facts.ts");
const { composeOwnerMonthlyObligation } = jiti("./owner-composition.ts");
const { selectBuildingOwnerDirectCharges } = jiti("./index.ts");

const charge = (overrides = {}) => ({
  id: "c1", series_id: "s1", building_id: "b1", unit_id: null, owner_id: "owner-4", description: "Owner fee", amount: 15,
  schedule: "recurring", effective_from_month: "2026-09-01", effective_to_month: null, stop_note: null,
  legacy_table: null, legacy_id: null, legacy_metadata: null, created_by: null, updated_by: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...overrides,
});

// OWN-000004's October Units as the canonical calculation produced them.
const component = (key, status, amount) => ({ key, label: key, status, amount, currency: "PEN", sourceMonth: "2026-10", provenance: "test", blocker: null });
const unit = (unitNumber, components, knownTotal) => ({ unitId: unitNumber, unitNumber, unitAccountId: unitNumber, unitTypeCode: "condo", components, knownTotal, readiness: "ready", missingComponents: [], blockers: [] });
const units = [
  unit("201", [component("fixed_assessment", "available", "369.81"), component("metered_water", "available", "4.25"), component("common_water", "available", "0.80"), component("gas", "available", "0.69"), component("other_charge", "not_applicable", null)], "375.55"),
  unit("EST-17", [component("fixed_assessment", "available", "35.50")], "35.50"),
  unit("DEPOS-30", [component("fixed_assessment", "available", "11.03")], "11.03"),
];
const compose = (ownerDirectCharges) => composeOwnerMonthlyObligation({ ownerId: "owner-4", ownerReference: "OWN-000004", ownerName: "Owner", obligationMonth: "2026-10", units, ownerDirectCharges });

test("no owner direct charges is S/ 0.00, available — not a blocker", () => {
  const direct = buildOwnerDirectCharges([], "2026-10");
  assert.deepEqual(direct, { state: "available", amount: "0.00", count: 0, reason: null, lineItems: [] });
  const owner = compose(direct);
  assert.deepEqual(owner.total, { state: "available", amount: "422.08" });
  assert.equal(owner.readiness, "ready");
});

test("owner direct charges use the building summary's selection rule", () => {
  const rows = [
    charge(),
    charge({ id: "unit-level", unit_id: "unit-201", owner_id: null }),
    charge({ id: "not-yet", effective_from_month: "2026-11-01" }),
    charge({ id: "one-off-oct", schedule: "one_off", effective_from_month: "2026-10-01", amount: 7.5 }),
  ];
  const direct = buildOwnerDirectCharges(rows, "2026-10");
  assert.deepEqual(direct.lineItems.map((item) => item.chargeId), ["c1", "one-off-oct"]);
  assert.equal(direct.amount, "22.50");
  assert.deepEqual(direct.lineItems.map((item) => item.chargeId), selectBuildingOwnerDirectCharges(rows, "2026-10").map((row) => row.id));
  assert.deepEqual(compose(direct).total, { state: "available", amount: "444.58" });
});

test("unavailable owner-direct data still blocks the owner", () => {
  // A failed load returns an error before composition.
  const source = readFileSync(new URL("./owner-facts.ts", import.meta.url), "utf8");
  assert.match(source, /if \(ownerDirectChargesResult\.error\) return \{ data: null, error: ownerDirectChargesResult\.error\.message, requestCount: 3 \};/);
  // A blocked owner-direct summary still blocks the total.
  const owner = compose({ state: "blocked", amount: null, count: 0, reason: "Owner direct charges are unavailable.", lineItems: [] });
  assert.deepEqual(owner.total, { state: "blocked", amount: null });
  assert.equal(owner.readiness, "blocked");
});
