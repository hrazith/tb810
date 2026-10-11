import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { createPersistedObligationProviders } = jiti("./persisted.ts");
const { composeMonthlyObligation } = jiti("./core.ts");
const { composeOwnerMonthlyObligation } = jiti("./owner-composition.ts");
const { calculateGasCharges } = jiti("../gas/calculation.ts");

const context = { obligationMonth: "2026-10", buildingId: "building", buildingName: "TB810" };

// Production October 2026 persisted rows for OWN-000083 (Carlos).
const carlosUnits = [
  { unitId: "u503", unitNumber: "503", unitAccountId: "u503", unitTypeCode: "condo", hasMeter: true, hasGasService: true, participationPercentage: 1 },
  { unitId: "uest11", unitNumber: "EST-11", unitAccountId: "uest11", unitTypeCode: "parking", hasMeter: false, hasGasService: false, participationPercentage: 0.2 },
  { unitId: "udepos42", unitNumber: "DEPOS-42", unitAccountId: "udepos42", unitTypeCode: "storage", hasMeter: false, hasGasService: false, participationPercentage: 0.1 },
];
const reservedBills = ["bill-a", "bill-b", "bill-c", "bill-d"];
const carlosRows = [
  { unit_id: "u503", obligation_type: "fixed_assessment", amount: 210.78, source_service_month: "2026-10-01", calculation_snapshot: { sourceMonth: "2026-10" } },
  { unit_id: "u503", obligation_type: "water_consumption", amount: 8.51, source_service_month: "2026-10-01", calculation_snapshot: { sourceMonth: "2026-10" } },
  { unit_id: "u503", obligation_type: "common_water", amount: 0.8, source_service_month: "2026-10-01", calculation_snapshot: { sourceMonth: "2026-10" } },
  { unit_id: "u503", obligation_type: "gas_consumption", amount: 5.96, source_service_month: "2026-09-01", calculation_snapshot: { sourceMonth: "2026-09", sourceIds: reservedBills } },
  { unit_id: "u503", obligation_type: "other_charge", amount: 22, source_service_month: "2026-10-01", calculation_snapshot: { sourceMonth: "2026-10", sourceIds: ["charge-bono"] } },
  { unit_id: "uest11", obligation_type: "fixed_assessment", amount: 42.32, source_service_month: "2026-10-01", calculation_snapshot: { sourceMonth: "2026-10" } },
  { unit_id: "udepos42", obligation_type: "fixed_assessment", amount: 27.68, source_service_month: "2026-10-01", calculation_snapshot: { sourceMonth: "2026-10" } },
];
const charges = new Map([
  ["u503", { amount: "22.00", lineItems: [{ chargeId: "charge-bono", description: "Bono empleados", amount: "22.00", effectiveFromMonth: "2026-10", effectiveToMonth: null }] }],
]);

async function composeCarlos(rows = carlosRows) {
  const obligation = await composeMonthlyObligation(context, carlosUnits, createPersistedObligationProviders(rows, charges));
  const owner = composeOwnerMonthlyObligation({
    ownerId: "own-83",
    ownerReference: "OWN-000083",
    ownerName: "Carlos Avila Bocangra",
    obligationMonth: "2026-10",
    units: obligation.units,
    ownerDirectCharges: { state: "available", amount: null, count: 0, reason: null, lineItems: [] },
  });
  return { obligation, owner };
}

function component(unit, key) {
  return unit.components.find((item) => item.key === key);
}

test("approved unit 503 shows its persisted Gas, not a recalculated zero", async () => {
  const { obligation } = await composeCarlos();
  const unit503 = obligation.units.find((unit) => unit.unitNumber === "503");
  assert.equal(component(unit503, "gas").status, "available");
  assert.equal(component(unit503, "gas").amount, "5.96");
  assert.equal(component(unit503, "gas").sourceMonth, "2026-09");
  assert.equal(unit503.knownTotal, "248.05");
  assert.equal(unit503.readiness, "ready");
});

test("approved owner Gas equals the sum of owned units and the owner total includes Gas", async () => {
  const { owner } = await composeCarlos();
  assert.equal(owner.componentSummary.gas.amount, "5.96");
  assert.equal(owner.componentSummary.fixed_assessment.amount, "280.78");
  assert.equal(owner.total.amount, "318.05");
  const persistedSum = carlosRows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  assert.equal(owner.total.amount, persistedSum.toFixed(2));
});

test("parking and storage units carry only their persisted rows", async () => {
  const { obligation } = await composeCarlos();
  for (const number of ["EST-11", "DEPOS-42"]) {
    const unit = obligation.units.find((item) => item.unitNumber === number);
    assert.equal(component(unit, "gas").status, "not_applicable");
    assert.equal(component(unit, "metered_water").status, "not_applicable");
    assert.equal(component(unit, "fixed_assessment").status, "available");
  }
});

test("a persisted zero-Gas unit still displays PEN 0.00", async () => {
  const rows = carlosRows.map((row) => row.obligation_type === "gas_consumption" ? { ...row, amount: 0 } : row);
  const { obligation, owner } = await composeCarlos(rows);
  const unit503 = obligation.units.find((unit) => unit.unitNumber === "503");
  assert.equal(component(unit503, "gas").status, "available");
  assert.equal(component(unit503, "gas").amount, "0.00");
  assert.equal(owner.total.amount, "312.09");
});

test("other-charge descriptions are kept as metadata while the amount stays persisted", async () => {
  const { obligation } = await composeCarlos();
  const other = component(obligation.units[0], "other_charge");
  assert.equal(other.amount, "22.00");
  assert.deepEqual(other.lineItems.map((item) => item.description), ["Bono empleados"]);
});

test("building total equals the sum of persisted rows", async () => {
  const { obligation } = await composeCarlos();
  assert.equal(obligation.knownTotal, "318.05");
});

test("recalculating with processed reserved bills would zero Gas, which approved views must not do", () => {
  const result = calculateGasCharges({
    sourceReadingMonth: "2026-09",
    obligationMonth: "2026-10",
    supplierBills: reservedBills.map((billId) => ({ billId, amount: "460", status: "processed" })),
    units: [{ unitId: "u503", unitNumber: "503", unitTypeCode: "condo", hasGasService: true, consumption: "0.460" }],
  });
  assert.equal(result.unitCharges[0].amount, "0.00");
});

test("Owner and Unit loaders read persisted rows only when a snapshot exists and keep live calculation otherwise", () => {
  for (const file of ["owner.ts", "index.ts"]) {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(source, /const persistedSnapshot = buildingFacts\.obligationSnapshot;/, file);
    assert.match(source, /persistedSnapshot\s*\?\s*await loadPersistedObligationRows\(/, file);
    assert.match(source, /persistedRows\s*\?\s*createPersistedObligationProviders\(persistedRows\.data, chargesByUnitId\)\s*:\s*createLiveProviders\(\)/, file);
  }
});
