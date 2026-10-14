import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { buildMonthlyObligationSummaryFromFacts, buildMonthlyObligationSummaryFromSnapshot } = jiti("./summary-facts.ts");
const { buildChargeMap, buildFixedAssessmentMap, buildGasCalculationInputFromFacts, buildOwnerDirectCharges, buildWaterPreviewFromFacts } = jiti("./owner-facts.ts");
const { calculateGasCharges } = jiti("../gas/calculation.ts");
const { createMonthlyObligationProviders } = jiti("./providers.ts");
const { composeMonthlyObligation } = jiti("./core.ts");
const { composeOwnerMonthlyObligation } = jiti("./owner-composition.ts");

// A building with every Unit type: Water and Gas apply to the condos only,
// fixed assessments and Unit-attached charges to every Unit.
const MONTH = "2026-10";
const charge = (id, target, amount, schedule = "one_off", from = "2026-10-01", to = null) => ({
  id, description: id, amount, schedule, effective_from_month: from, effective_to_month: to, unit_id: null, owner_id: null, ...target,
});
const CHARGES = {
  apartment: charge("apartment-charge", { unit_id: "condo-1" }, 10),
  parking: charge("parking-charge", { unit_id: "parking-1" }, 20, "recurring", "2026-09-01"),
  storage: charge("storage-charge", { unit_id: "storage-1" }, 30),
  ownerDirect: charge("owner-direct-charge", { owner_id: "owner-1" }, 40),
  // Not eligible in October: a September one-off and a recurring charge stopped in September.
  pastOneOff: charge("past-one-off", { unit_id: "storage-1" }, 99, "one_off", "2026-09-01"),
  stoppedRecurring: charge("stopped-recurring", { unit_id: "condo-2" }, 77, "recurring", "2026-08-01", "2026-09-01"),
};

function mixedBuildingFacts(charges) {
  return {
    obligationMonth: MONTH,
    sourceReadingMonth: "2026-09",
    gasSourceMonth: MONTH,
    planYear: 2026,
    plan: { currency: "PEN", monthly_operating_budget: "1000.00" },
    commonWaterType: { id: "common-water", code: "common_water", name: "Common Water" },
    commonWaterBill: { amount: "30.00", total_consumption: "4.000" },
    unitRows: [
      { id: "condo-1", unit_number: "101", unit_type_id: "condo", unit_type_code: "condo", has_meter: true, has_gas_service: true, participation_percentage: 40 },
      { id: "condo-2", unit_number: "102", unit_type_id: "condo", unit_type_code: "condo", has_meter: true, has_gas_service: true, participation_percentage: 40 },
      { id: "parking-1", unit_number: "E-01", unit_type_id: "parking", unit_type_code: "parking", has_meter: false, has_gas_service: false, participation_percentage: 10 },
      { id: "storage-1", unit_number: "D-01", unit_type_id: "storage", unit_type_code: "storage", has_meter: false, has_gas_service: false, participation_percentage: 10 },
    ],
    waterReadings: [
      { unit_id: "condo-1", reading_end: 2, consumption: 1, reading_date: "2026-09-05", created_at: "2026-09-05T00:00:00Z" },
      { unit_id: "condo-2", reading_end: 2, consumption: 1, reading_date: "2026-09-05", created_at: "2026-09-05T00:00:00Z" },
    ],
    gasBills: [{ id: "gas-bill-1", amount: "20.00", processed_at: null, invoice_date: "2026-09-10" }],
    gasReadings: [
      { unit_id: "condo-1", reading_month: "2026-10-01", current_reading: 1, previous_reading: 0, consumption: 1 },
      { unit_id: "condo-2", reading_month: "2026-10-01", current_reading: 1, previous_reading: 0, consumption: 1 },
    ],
    obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null, gasReservationState: null },
    charges,
  };
}

test("building Common Water summary sums each participating unit obligation", () => {
  const facts = {
    obligationMonth: "2026-09",
    sourceReadingMonth: "2026-08",
    planYear: 2026,
    plan: { currency: "PEN", monthly_operating_budget: "1000.00" },
    commonWaterType: { id: "common-water", code: "common_water", name: "Common Water" },
    commonWaterBill: { amount: "10.00", total_consumption: "3.000" },
    unitRows: [
      { id: "unit-1", unit_number: "101", unit_type_id: "condo", unit_type_code: "condo", has_meter: true, has_gas_service: true, participation_percentage: 50 },
      { id: "unit-2", unit_number: "102", unit_type_id: "condo", unit_type_code: "condo", has_meter: true, has_gas_service: true, participation_percentage: 50 },
    ],
    waterReadings: [
      { unit_id: "unit-1", reading_end: 2, consumption: 1, reading_date: "2026-08-31", created_at: "2026-08-31T00:00:00Z" },
      { unit_id: "unit-2", reading_end: 2, consumption: 1, reading_date: "2026-08-31", created_at: "2026-08-31T00:00:00Z" },
    ],
    gasBills: [{ id: "gas-bill-1", amount: "10.00", processed_at: null, invoice_date: "2026-08-01" }],
    gasReadings: [
      { unit_id: "unit-1", reading_month: "2026-08-01", current_reading: 1, previous_reading: 0, consumption: 1 },
      { unit_id: "unit-2", reading_month: "2026-08-01", current_reading: 1, previous_reading: 0, consumption: 1 },
    ],
    charges: [],
  };

  const summary = buildMonthlyObligationSummaryFromFacts(facts, "2026-09");

  assert.equal(summary.components.common_water.amount, "3.34");
  assert.equal(summary.total, "1020.00");
  assert.equal(summary.components.common_water.sourcePool, "3.34");
  assert.equal(summary.components.common_water.roundingVariance, "0.00", "exact division has no rounding variance");
});

test("snapshotted building summary uses persisted component totals", () => {
  const facts = {
    unitRows: [{ id: "unit-1", unit_type_code: "condo" }],
    charges: [],
  };
  const snapshot = {
    billingPeriodId: "period-1",
    status: "ready_for_review",
    components: {
      fixed_assessment: { amount: "100.00", count: 1 },
      water_consumption: { amount: "20.00", count: 1 },
      common_water: { amount: "3.25", count: 1 },
      gas_consumption: { amount: "30.00", count: 1 },
      other_charge: { amount: "25.00", count: 1 },
    },
    total: "178.25",
  };

  const summary = buildMonthlyObligationSummaryFromSnapshot(facts, "2026-09", snapshot);

  assert.equal(summary.components.common_water.amount, "3.25");
  assert.equal(summary.total, "178.25");
});

for (const [unitType, key, amount] of [["an apartment", "apartment", "10.00"], ["a parking", "parking", "20.00"], ["a storage", "storage", "30.00"]]) {
  test(`building summary includes a Unit-attached charge on ${unitType} Unit`, () => {
    const summary = buildMonthlyObligationSummaryFromFacts(mixedBuildingFacts([CHARGES[key], CHARGES.pastOneOff, CHARGES.stoppedRecurring]), MONTH);

    assert.equal(summary.components.other_charge.amount, amount);
    assert.equal(summary.components.other_charge.count, 1, "charges outside October stay excluded");
  });
}

test("Owner-direct charges stay out of the building package and are reported separately", () => {
  const summary = buildMonthlyObligationSummaryFromFacts(mixedBuildingFacts(Object.values(CHARGES)), MONTH);

  assert.equal(summary.components.other_charge.amount, "60.00");
  assert.equal(summary.components.other_charge.count, 3);
  assert.equal(summary.components.owner_direct_charge.amount, "40.00");
  assert.equal(summary.components.owner_direct_charge.count, 1);
  // Fixed 1,000.00 + metered water 15.00 + Common Water 15.00 + Gas 20.00 + Unit charges 60.00.
  const packageTotal = Number(summary.total) - Number(summary.components.owner_direct_charge.amount);
  assert.equal(packageTotal.toFixed(2), "1110.00");
  assert.equal(summary.total, "1150.00");
});

test("building summary reconciles with the canonical Owner totals once Owner-direct charges are added", async () => {
  const facts = mixedBuildingFacts(Object.values(CHARGES));
  const summary = buildMonthlyObligationSummaryFromFacts(facts, MONTH);

  // Unit obligations composed exactly as the Owner read model and the approval snapshot do.
  const gasCalculation = calculateGasCharges(buildGasCalculationInputFromFacts(facts, MONTH));
  assert.deepEqual(gasCalculation.blockers, []);
  const unitIds = facts.unitRows.map((unit) => unit.id);
  const composed = await composeMonthlyObligation(
    { obligationMonth: MONTH, buildingId: "building-1", buildingName: "Building" },
    facts.unitRows.map((unit) => ({
      unitId: unit.id, unitNumber: unit.unit_number, unitAccountId: unit.id, unitTypeCode: unit.unit_type_code,
      hasMeter: unit.has_meter, hasGasService: unit.has_gas_service, participationPercentage: unit.participation_percentage,
    })),
    createMonthlyObligationProviders({
      fixedAssessmentByUnitId: buildFixedAssessmentMap(facts.plan, facts.planYear, facts.unitRows),
      waterByUnitId: new Map(facts.unitRows.map((unit) => [unit.id, buildWaterPreviewFromFacts(unit, MONTH, facts)])),
      gasByUnitId: new Map(unitIds.map((id) => [id, { status: "available", data: { ...gasCalculation, sourceReadingMonthLabel: MONTH, billingMonthLabel: MONTH } }])),
      chargesByUnitId: buildChargeMap(facts.charges, MONTH, unitIds),
    }),
  );

  const owners = [
    { ownerId: "owner-1", unitIds: ["condo-1", "parking-1"] },
    { ownerId: "owner-2", unitIds: ["condo-2", "storage-1"] },
  ].map(({ ownerId, unitIds: ownedUnitIds }) => composeOwnerMonthlyObligation({
    ownerId, ownerReference: ownerId, ownerName: ownerId, obligationMonth: MONTH,
    units: composed.units.filter((unit) => ownedUnitIds.includes(unit.unitId)),
    ownerDirectCharges: buildOwnerDirectCharges(facts.charges.filter((row) => row.owner_id === ownerId), MONTH),
  }));

  for (const owner of owners) assert.equal(owner.total.state, "available", `${owner.ownerId} total`);
  const cents = (value) => Math.round(Number(value) * 100);
  const ownerTotal = owners.reduce((sum, owner) => sum + cents(owner.total.amount), 0);
  const unitTotal = composed.units.reduce((sum, unit) => sum + cents(unit.knownTotal), 0);
  const ownerDirectTotal = cents(summary.components.owner_direct_charge.amount);

  assert.equal(unitTotal, cents(summary.total) - ownerDirectTotal, "building package equals the sum of Unit obligations");
  assert.equal(ownerTotal, cents(summary.total), "consolidated building total equals the sum of Owner totals");
  assert.equal(ownerTotal, unitTotal + ownerDirectTotal);
});
