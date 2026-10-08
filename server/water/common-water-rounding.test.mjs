import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

// WATER-012 (current policy): every eligible condo is charged the same Common
// Water share, rounded UP to the céntimo. The source pool is never rewritten;
// the rounding variance (allocated - pool) is always >= 0. Approved packages
// are never recalculated: they report Common Water as persisted.
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { calculateCommonWaterAllocationCents, describeCommonWaterRounding, persistedCommonWaterChargePreview } = jiti("./index.ts");
const { buildMonthlyObligationSummaryFromFacts, buildMonthlyObligationSummaryFromSnapshot } = jiti("../obligations/summary-facts.ts");
const { buildWaterPreviewFromFacts } = jiti("../obligations/owner-facts.ts");

const UNIT_NUMBERS = "201,202,203,204,205,206,301,302,303,304,305,306,401,402,403,404,405,406,501,502,503,504,505,506,601,602,603,604,605,606,701,702,703,704,801,802,803,804,901,902,903,904,1001,1002,1003,1101,1102,1103,1201,1202,1203,1301,1302,1303,1401,1402,1403,1501,1502,1503,1601,1602,1701,1702".split(",");
// Real per-condo consumption (m3), in UNIT_NUMBERS order.
const SEPTEMBER_SOURCE = "1,0,5,13,7,17,0,14,6,6,2,11,8,14,12,5,3,0,5,0,2,15,18,25,1,11,27,5,1,0,13,3,4,7,46,4,1,0,5,8,5,6,34,6,0,17,7,0,25,0,10,6,1,13,14,0,33,16,38,25,7,3,39,7".split(",").map(Number);
const AUGUST_SOURCE = "1,1,2,13,6,16,0,15,9,7,3,7,11,13,11,0,1,0,2,0,8,8,15,22,0,9,25,4,0,0,15,3,3,4,37,3,0,2,5,8,33,3,21,6,1,13,7,3,26,0,10,5,5,13,11,0,19,18,109,40,9,4,33,8".split(",").map(Number);
// October owner Water amounts before this change (metered, common), in UNIT_NUMBERS order.
const OCTOBER_METERED_BASELINE = "4.25,0.00,21.27,55.30,29.77,72.31,0.00,59.55,25.52,25.52,8.51,46.79,34.03,59.55,51.04,21.27,12.76,0.00,21.27,0.00,8.51,63.80,76.56,106.34,4.25,46.79,114.84,21.27,4.25,0.00,55.30,12.76,17.01,29.77,195.66,17.01,4.25,0.00,21.27,34.03,21.27,25.52,144.62,25.52,0.00,72.31,29.77,0.00,106.34,0.00,42.53,25.52,4.25,55.30,59.55,0.00,140.36,68.06,161.63,106.34,29.77,12.76,165.89,29.77".split(",");

function buildingFacts({ obligationMonth, sourceReadingMonth, bill, consumptions, unitNumbers = UNIT_NUMBERS, unmetered = [], obligationSnapshot = null }) {
  const unitRows = unitNumbers.map((unitNumber) => ({
    id: `unit-${unitNumber}`, unit_number: unitNumber, unit_type_id: "condo", unit_type_code: "condo",
    has_meter: !unmetered.includes(unitNumber), has_gas_service: true, participation_percentage: 100 / unitNumbers.length,
  }));
  return {
    obligationMonth,
    sourceReadingMonth,
    planYear: 2026,
    plan: { currency: "PEN", monthly_operating_budget: "6400.00" },
    commonWaterType: { id: "common-water", code: "common_water", name: "Common Water" },
    commonWaterBill: bill,
    unitRows,
    waterReadings: unitRows.map((unit, index) => ({
      unit_id: unit.id, reading_end: 1000 + consumptions[index], consumption: consumptions[index],
      reading_date: `${sourceReadingMonth}-05`, created_at: `${sourceReadingMonth}-05T00:00:00Z`,
    })),
    gasBills: [{ id: "gas-bill-1", amount: "64.00", processed_at: null, invoice_date: `${sourceReadingMonth}-01` }],
    gasReadings: unitRows.map((unit) => ({ unit_id: unit.id, reading_month: `${sourceReadingMonth}-01`, current_reading: 1, previous_reading: 0, consumption: 1 })),
    charges: [],
    obligationSnapshot,
  };
}

const cents = (value) => Math.round(Number(value) * 100);
const preview = (facts, unitNumber, month) => buildWaterPreviewFromFacts(facts.unitRows.find((unit) => unit.unit_number === unitNumber), month, facts);

test("primitive: equal share is the integer ceiling to the céntimo", () => {
  assert.deepEqual(calculateCommonWaterAllocationCents({ sourcePoolCents: 5104n, eligibleUnitCount: 64n }), {
    sourcePoolCents: 5104n, exactUnitShareMicros: 797500n, unitShareCents: 80n, allocatedCents: 5120n, roundingVarianceCents: 16n,
  });

  const september = calculateCommonWaterAllocationCents({ sourcePoolCents: 10693n, eligibleUnitCount: 64n });
  assert.equal(september.exactUnitShareMicros, 1670781n, "106.93 / 64 = 1.67078125");
  assert.equal(september.unitShareCents, 168n, "rounded up, not to the nearest céntimo (1.67)");
  assert.equal(september.allocatedCents, 10752n);
  assert.equal(september.roundingVarianceCents, 59n, "the old -0.05 result is impossible for a new calculation");

  const exact = calculateCommonWaterAllocationCents({ sourcePoolCents: 6400n, eligibleUnitCount: 64n });
  assert.equal(exact.unitShareCents, 100n, "an exact céntimo share is unchanged");
  assert.equal(exact.roundingVarianceCents, 0n);

  assert.equal(calculateCommonWaterAllocationCents({ sourcePoolCents: 6401n, eligibleUnitCount: 64n }).unitShareCents, 101n, "any fractional céntimo rounds up");
  assert.equal(calculateCommonWaterAllocationCents({ sourcePoolCents: 0n, eligibleUnitCount: 64n }).roundingVarianceCents, 0n);
  assert.equal(calculateCommonWaterAllocationCents({ sourcePoolCents: 100n, eligibleUnitCount: 0n }), null);
  assert.equal(calculateCommonWaterAllocationCents({ sourcePoolCents: -1n, eligibleUnitCount: 64n }), null);
});

test("property: allocated >= pool and 0 <= variance < one céntimo per eligible unit", () => {
  for (const units of [1n, 2n, 3n, 7n, 63n, 64n, 65n, 100n, 172n]) {
    for (let pool = 0n; pool <= 50000n; pool += 7n) {
      const result = calculateCommonWaterAllocationCents({ sourcePoolCents: pool, eligibleUnitCount: units });
      assert.equal(result.allocatedCents, result.unitShareCents * units);
      assert.equal(result.roundingVarianceCents, result.allocatedCents - pool);
      assert.ok(result.allocatedCents >= pool, `allocated >= pool (${pool}/${units})`);
      assert.ok(result.roundingVarianceCents >= 0n && result.roundingVarianceCents < units, `0 <= variance < units (${pool}/${units})`);
      assert.ok((result.unitShareCents - 1n) * units < pool || result.unitShareCents === 0n, "the smallest covering share");
    }
  }
});

test("October 2026: pool 51.04, share 0.80, allocated 51.20, variance +0.16; owner Water unchanged", () => {
  const facts = buildingFacts({ obligationMonth: "2026-10", sourceReadingMonth: "2026-09", bill: { amount: 2760.5, total_consumption: 649 }, consumptions: SEPTEMBER_SOURCE });

  const unit201 = preview(facts, "201", "2026-10");
  assert.equal(unit201.meteredWater.data.amount, "4.25");
  assert.equal(cents(unit201.meteredWater.data.amount) + cents(unit201.commonWater.data.unitCommonWaterCharge), 505, "Unit 201 Water stays PEN 5.05");
  assert.deepEqual(unit201.commonWater.data, {
    billingMonthLabel: unit201.commonWater.data.billingMonthLabel,
    sourceReadingMonthLabel: unit201.commonWater.data.sourceReadingMonthLabel,
    completedCount: 64,
    expectedCount: 64,
    supplierAmount: "2760.50",
    summedMeteredCharges: "2709.46",
    commonWaterPool: "51.04",
    exactUnitCommonWaterShare: "0.797500",
    unitCommonWaterCharge: "0.80",
    eligibleUnitCount: 64,
    allocatedCommonWaterTotal: "51.20",
    commonWaterRoundingVariance: "0.16",
    allocationBasis: "calculated",
  });
  UNIT_NUMBERS.forEach((unitNumber, index) => {
    const water = preview(facts, unitNumber, "2026-10");
    assert.equal(water.meteredWater.data.amount, OCTOBER_METERED_BASELINE[index], `unit ${unitNumber} metered`);
    assert.equal(water.commonWater.data.unitCommonWaterCharge, "0.80", `unit ${unitNumber} common`);
  });

  const summary = buildMonthlyObligationSummaryFromFacts(facts, "2026-10");
  assert.deepEqual(summary.components.metered_water, { state: "available", amount: "2709.46" });
  assert.deepEqual(summary.components.common_water, { state: "available", amount: "51.20", sourcePool: "51.04", roundingVariance: "0.16", allocationBasis: "calculated" });
  assert.equal(cents(summary.components.metered_water.amount) + cents(summary.components.common_water.sourcePool), 276050, "metered + source pool = Sedapal bill");
  const keys = ["fixed_assessment", "metered_water", "common_water", "gas", "other_charge", "owner_direct_charge"];
  assert.ok(keys.every((key) => summary.components[key].state === "available"));
  assert.equal(cents(summary.total), keys.reduce((sum, key) => sum + cents(summary.components[key].amount), 0), "the total uses the owner allocation");
});

test("September figures under the current policy: share 1.68, allocated 107.52, variance +0.59", () => {
  const facts = buildingFacts({ obligationMonth: "2026-09", sourceReadingMonth: "2026-08", bill: { amount: 3042, total_consumption: 711 }, consumptions: AUGUST_SOURCE });
  const summary = buildMonthlyObligationSummaryFromFacts(facts, "2026-09");
  assert.deepEqual(summary.components.metered_water, { state: "available", amount: "2935.07" });
  assert.deepEqual(summary.components.common_water, { state: "available", amount: "107.52", sourcePool: "106.93", roundingVariance: "0.59", allocationBasis: "calculated" });
  for (const unitNumber of UNIT_NUMBERS) {
    assert.equal(preview(facts, unitNumber, "2026-09").commonWater.data.unitCommonWaterCharge, "1.68", `unit ${unitNumber}`);
  }
});

test("approved September is described as persisted, never recalculated with the current policy", () => {
  const snapshot = {
    billingPeriodId: "period-2026-09",
    status: "approved",
    components: {
      fixed_assessment: { amount: "6400.00", count: 64 },
      water_consumption: { amount: "2935.07", count: 64 },
      common_water: { amount: "106.88", count: 64 },
      gas_consumption: { amount: "64.00", count: 64 },
      other_charge: { amount: "0.00", count: 0 },
    },
    total: "9505.95",
  };
  const facts = buildingFacts({ obligationMonth: "2026-09", sourceReadingMonth: "2026-08", bill: { amount: 3042, total_consumption: 711 }, consumptions: AUGUST_SOURCE, obligationSnapshot: snapshot });

  const summary = buildMonthlyObligationSummaryFromSnapshot(facts, "2026-09", snapshot);
  assert.deepEqual(summary.components.common_water, { state: "available", amount: "106.88", sourcePool: "106.93", roundingVariance: "-0.05", allocationBasis: "persisted" });
  assert.deepEqual(
    buildMonthlyObligationSummaryFromFacts(facts, "2026-09").components.common_water,
    { state: "available", amount: "106.88", sourcePool: "106.93", roundingVariance: "-0.05", allocationBasis: "persisted" },
    "the live-facts summary also describes the persisted package",
  );
  assert.equal(summary.total, "9505.95", "persisted package total unchanged");

  for (const unitNumber of UNIT_NUMBERS) {
    const water = preview(facts, unitNumber, "2026-09").commonWater;
    assert.equal(water.data.unitCommonWaterCharge, "1.67", `unit ${unitNumber} keeps its approved share`);
    assert.equal(water.data.allocatedCommonWaterTotal, "106.88");
    assert.equal(water.data.commonWaterRoundingVariance, "-0.05");
    assert.equal(water.data.allocationBasis, "persisted");
  }

  assert.deepEqual(describeCommonWaterRounding({ supplierAmount: "3042.00", meteredTotal: 2935.07, allocatedTotal: 106.88 }), { sourcePool: "106.93", roundingVariance: "-0.05" });
  const withoutBill = buildMonthlyObligationSummaryFromSnapshot({ ...facts, commonWaterBill: null }, "2026-09", snapshot);
  assert.deepEqual(withoutBill.components.common_water, { state: "available", amount: "106.88", sourcePool: null, roundingVariance: null, allocationBasis: "persisted" }, "never guessed");
});

test("a persisted Common Water total that is not an equal share is not explained away", () => {
  const live = { status: "available", data: { commonWaterPool: "106.93", unitCommonWaterCharge: "1.68" } };
  assert.deepEqual(persistedCommonWaterChargePreview(live, { amount: "106.89", count: 64 }), { status: "unavailable", message: "Persisted Common Water is not an equal share per unit." });
  assert.equal(persistedCommonWaterChargePreview({ status: "not-applicable", message: "n/a" }, { amount: "106.88", count: 64 }).status, "not-applicable");
});

test("summary allocation covers every eligible condo, not only metered condos", () => {
  // Unit 103 is a condo without a meter but with a reading: it still shares Common Water.
  const facts = buildingFacts({
    obligationMonth: "2026-10", sourceReadingMonth: "2026-09", bill: { amount: "10.00", total_consumption: 3 },
    consumptions: [1, 1, 0], unitNumbers: ["101", "102", "103"], unmetered: ["103"],
  });
  const owners = ["101", "102", "103"].map((unitNumber) => preview(facts, unitNumber, "2026-10"));
  assert.equal(owners[2].meteredWater.status, "not-applicable");
  assert.ok(owners.every((water) => water.commonWater.status === "available" && water.commonWater.data.unitCommonWaterCharge === "1.12"));
  const charged = owners.reduce((sum, water) => sum + cents(water.commonWater.data.unitCommonWaterCharge), 0);

  const summary = buildMonthlyObligationSummaryFromFacts(facts, "2026-10");
  assert.equal(cents(summary.components.common_water.amount), charged, "summary equals what the three owners are charged");
  assert.deepEqual(summary.components.common_water, { state: "available", amount: "3.36", sourcePool: "3.34", roundingVariance: "0.02", allocationBasis: "calculated" });
});
