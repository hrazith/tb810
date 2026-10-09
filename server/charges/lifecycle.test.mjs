import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});
const {
  canDeleteChargeSeries,
  canStopCharge,
  chargeEditWindowFromProgression,
  isChargeEditable,
  isChargeMonthEditable,
  validateChargeLifecycleInput,
} = jiti("./index.ts");
const { isChargeEligibleForMonth } = jiti("./month.ts");

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

function makeProgression({ active, pendingReviews = [], mostRecentHandoff = null }) {
  return {
    activePackage: { obligationMonth: active, mode: "live", status: null },
    mostRecentHandoff,
    pendingReviews: pendingReviews.map((obligationMonth, index) => ({
      billingPeriodId: `period-${obligationMonth}`,
      obligationMonth,
      status: "ready_for_review",
      outstanding: true,
      chronologicallyActionable: index === 0,
      approvalEligible: index === 0,
    })),
  };
}

// Business calendar October 2026; October not yet handed off.
const liveOctober = chargeEditWindowFromProgression(makeProgression({ active: "2026-10" }));
// October handed off to Carlos; November is Giuliana's active package.
const octoberInReview = chargeEditWindowFromProgression(makeProgression({
  active: "2026-11",
  pendingReviews: ["2026-10"],
  mostRecentHandoff: { obligationMonth: "2026-10", status: "ready_for_review" },
}));
// October approved by Carlos.
const octoberApproved = chargeEditWindowFromProgression(makeProgression({
  active: "2026-11",
  mostRecentHandoff: { obligationMonth: "2026-10", status: "approved" },
}));

function startIn(month, window, isUnitTarget, schedule = "one_off") {
  return validateChargeLifecycleInput({ schedule, starts_month: month, ends_month: null }, window, isUnitTarget);
}

test("progression maps to the active package and the latest ready_for_review package", () => {
  assert.deepEqual(liveOctober, { activePackageMonth: "2026-10", correctionMonth: null });
  assert.deepEqual(octoberInReview, { activePackageMonth: "2026-11", correctionMonth: "2026-10" });
  assert.deepEqual(octoberApproved, { activePackageMonth: "2026-11", correctionMonth: null });
  const twoInReview = chargeEditWindowFromProgression(makeProgression({ active: "2026-12", pendingReviews: ["2026-10", "2026-11"] }));
  assert.deepEqual(twoInReview, { activePackageMonth: "2026-12", correctionMonth: "2026-11" });
});

test("the live October package accepts Unit, owner and bulk charges before handoff", () => {
  // Single Unit, all-Units bulk (Unit target) and Owner / all-owners bulk (non-Unit target).
  for (const isUnitTarget of [true, false]) {
    const oneOff = startIn("2026-10", liveOctober, isUnitTarget);
    assert.equal(oneOff.error, null);
    assert.equal(oneOff.effectiveFromMonth, "2026-10-01");
    assert.equal(startIn("2026-10", liveOctober, isUnitTarget, "recurring").error, null);
    assert.match(startIn("2026-09", liveOctober, isUnitTarget).error ?? "", /Start month cannot be before 2026-10\./);
  }

  const octoberCharge = makeCharge({ effective_from_month: "2026-10-01" });
  assert.equal(isChargeEditable(octoberCharge, liveOctober), true);
  assert.equal(isChargeEditable(makeCharge({ unit_id: null, owner_id: "owner-1", effective_from_month: "2026-10-01" }), liveOctober), true);
  assert.equal(canDeleteChargeSeries([octoberCharge], liveOctober), true);
  // Stop and economics changes use the same month rule.
  assert.equal(isChargeMonthEditable("2026-10", liveOctober, true), true);
  assert.equal(isChargeMonthEditable("2026-10", liveOctober, false), true);
});

test("editability follows the package progression, not the calendar month", () => {
  // The rule has no calendar input: while progression reports October as the
  // active package, October stays editable whatever the date is.
  const stillActive = chargeEditWindowFromProgression(makeProgression({ active: "2026-10" }));
  assert.equal(startIn("2026-10", stillActive, true).error, null);
  assert.equal(startIn("2026-10", stillActive, false).error, null);
  assert.equal(isChargeEditable(makeCharge({ effective_from_month: "2026-10-01" }), stillActive), true);
});

test("the latest ready_for_review package stays correctable for Unit Charges only", () => {
  const correction = startIn("2026-10", octoberInReview, true);
  assert.equal(correction.error, null);
  assert.equal(isChargeEditable(makeCharge({ effective_from_month: "2026-10-01" }), octoberInReview), true);
  assert.equal(isChargeMonthEditable("2026-10", octoberInReview, true), true);

  assert.match(startIn("2026-10", octoberInReview, false).error ?? "", /Start month cannot be before 2026-11\./);
  assert.equal(isChargeEditable(makeCharge({ unit_id: null, owner_id: "owner-1", effective_from_month: "2026-10-01" }), octoberInReview), false);
  // An older review in the queue is not the correction month.
  const twoInReview = chargeEditWindowFromProgression(makeProgression({ active: "2026-12", pendingReviews: ["2026-10", "2026-11"] }));
  assert.match(startIn("2026-10", twoInReview, true).error ?? "", /Start month cannot be before 2026-12\./);
  // A correction never lets a whole multi-month series be deleted.
  assert.equal(canDeleteChargeSeries([makeCharge({ effective_from_month: "2026-10-01" })], octoberInReview), false);
});

test("approved and earlier packages cannot be modified", () => {
  for (const isUnitTarget of [true, false]) {
    assert.match(startIn("2026-10", octoberApproved, isUnitTarget).error ?? "", /Start month cannot be before 2026-11\./);
    assert.match(startIn("2026-09", octoberInReview, isUnitTarget).error ?? "", /Start month cannot be before 2026-11\./);
    assert.equal(isChargeMonthEditable("2026-10", octoberApproved, isUnitTarget), false);
  }
  const approvedCharge = makeCharge({ effective_from_month: "2026-10-01" });
  assert.equal(isChargeEditable(approvedCharge, octoberApproved), false);
  assert.equal(canDeleteChargeSeries([approvedCharge], octoberApproved), false);

  const mixedSeries = [
    makeCharge({ id: "row-1", schedule: "recurring", effective_from_month: "2026-10-01" }),
    makeCharge({ id: "row-2", schedule: "recurring", effective_from_month: "2026-11-01" }),
  ];
  assert.equal(canDeleteChargeSeries(mixedSeries, octoberApproved), false);
});

test("future creation, edits and series deletes still work", () => {
  for (const window of [liveOctober, octoberInReview, octoberApproved]) {
    for (const isUnitTarget of [true, false]) {
      const futureRecurring = validateChargeLifecycleInput({
        schedule: "recurring",
        starts_month: "2026-12",
        ends_month: "2027-03",
      }, window, isUnitTarget);
      assert.equal(futureRecurring.error, null);
      assert.equal(futureRecurring.effectiveToMonth, "2027-03-01");
    }
  }
  const futureSeries = [
    makeCharge({ id: "row-1", schedule: "recurring", effective_from_month: "2026-11-01" }),
    makeCharge({ id: "row-2", schedule: "recurring", effective_from_month: "2026-12-01" }),
  ];
  assert.equal(canDeleteChargeSeries(futureSeries, octoberApproved), true);
  assert.equal(canDeleteChargeSeries([], octoberApproved), false);
});

test("a recurring charge with no end month is accepted and stays eligible", () => {
  const openEnded = startIn("2026-10", liveOctober, true, "recurring");
  assert.equal(openEnded.error, null);
  assert.equal(openEnded.effectiveToMonth, null);
  for (const month of ["2026-10", "2026-11", "2026-12", "2027-06"]) {
    assert.equal(isChargeEligibleForMonth({ schedule: "recurring", effectiveFromMonth: "2026-10", effectiveToMonth: null, obligationMonth: month }), true);
  }
  assert.equal(isChargeEligibleForMonth({ schedule: "recurring", effectiveFromMonth: "2026-10", effectiveToMonth: null, obligationMonth: "2026-09" }), false);
});

test("stop safety rejects one-off and preserves recurring semantics", () => {
  assert.equal(canStopCharge(makeCharge({ schedule: "one_off" })), false);
  assert.equal(canStopCharge(makeCharge({ schedule: "recurring" })), true);
});
