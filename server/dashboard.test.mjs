import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});

const dashboard = jiti("./dashboard.ts");
const businessDateModule = jiti("@/server/business-date");
const buildingModule = jiti("@/server/building");
const ownerFactsModule = jiti("@/server/obligations/owner-facts");
const progressionModule = jiti("@/server/obligations/progression");

const { projectCarlosDashboard, projectGulianaDashboard, deriveUnitChargeWorthNoting, deriveGulianaDashboardMonths, deriveDashboardContext, financialReadinessDeadline, getGulianaDashboardFacts, selectDashboardPackageMonth, deriveCarlosApprovalAttentions } = dashboard;

function buildProjectionFacts(overrides = {}) {
  const businessDate = overrides.businessDate ?? "2026-08-05";
  const overrideSourceWork = overrides.sourceWork ?? {};
  const overrideUpcoming = overrides.upcoming ?? {};
  const overrideUpcomingObligations = overrideUpcoming.obligations ?? {};
  const sourceWork = {
    water: {
      commonWaterBillPresent: false,
      meterReadingCount: 0,
      meterReadingExpectedCount: 0,
      meterReadingCompleteCount: 0,
      ...(overrideSourceWork.water ?? {}),
    },
    gas: {
      supplierBillCount: 0,
      gasReadingCount: 0,
      gasUnitCount: 0,
      ...(overrideSourceWork.gas ?? {}),
    },
  };

  const upcoming = {
    sourceReadingMonth: "2026-08",
    ...overrideUpcoming,
    obligations: {
      obligationMonth: "2026-09",
      eligibleUnitCount: 0,
      components: {
        fixed_assessment: { state: "available", amount: "0.00", reason: null },
        metered_water: { state: "available", amount: "0.00", reason: null },
        common_water: { state: "available", amount: "0.00", reason: null },
        gas: { state: "available", amount: "0.00", reason: null },
        other_charge: { state: "available", amount: "0.00", count: 0 },
        owner_direct_charge: { state: "available", amount: "0.00", count: 0 },
        ...(overrideUpcomingObligations.components ?? {}),
      },
      total: null,
      ...overrideUpcomingObligations,
      components: {
        fixed_assessment: { state: "available", amount: "0.00", reason: null },
        metered_water: { state: "available", amount: "0.00", reason: null },
        common_water: { state: "available", amount: "0.00", reason: null },
        gas: { state: "available", amount: "0.00", reason: null },
        other_charge: { state: "available", amount: "0.00", count: 0 },
        owner_direct_charge: { state: "available", amount: "0.00", count: 0 },
        ...(overrideUpcomingObligations.components ?? {}),
      },
    },
    gas: {
      supplierBillCount: 0,
      supplierBillTotal: "0.00",
      ...(overrideUpcoming.gas ?? {}),
    },
    charges: {
      unitChargeCount: 0,
      ownerDirectChargeCount: 0,
      ...(overrideUpcoming.charges ?? {}),
    },
    worthNoting: overrideUpcoming.worthNoting ?? [],
    obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null },
  };

  return {
    businessDate,
    operatingMonth: "2026-08",
    upcomingObligationMonth: "2026-09",
    context: overrides.context ?? (businessDate.endsWith("-09-01") ? "open" : "close"),
    sourceWork,
    mostRecentHandoff: overrides.mostRecentHandoff ?? null,
    pendingReviews: overrides.pendingReviews ?? [],
    current: overrides.current ?? upcoming,
    upcoming,
  };
}

test("A month open stays calm and produces no manufactured exceptions", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts());
  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.gas.state, "waiting");
  assert.deepEqual(projection.attentions, []);
});

test("B early month with partial water work stays neutral before the deadline", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 2,
        meterReadingExpectedCount: 4,
        meterReadingCompleteCount: 2,
      },
    },
  }));

  assert.equal(projection.water.state, "active");
  assert.equal(projection.water.completion, "incomplete");
  assert.equal(projection.water.emphasis, "normal");
  assert.deepEqual(projection.attentions, []);
});

test("B2 missing Sedapal plus incomplete water readings are late from day seven", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      water: {
        commonWaterBillPresent: false,
        meterReadingCount: 1,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 1,
      },
    },
    upcoming: {
      obligations: {
        components: {
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
        },
      },
    },
  }));

  assert.equal(projection.water.state, "blocked");
  assert.equal(projection.water.emphasis, "attention");
  assert.deepEqual(projection.attentions, [
    {
      source: "water",
      happened: "August Sedapal bill is still missing for September obligations.",
      impact: "September water obligations cannot be completed.",
    },
    {
      source: "water",
      happened: "63 August Water readings are still missing for September obligations.",
      impact: "September water obligations cannot be completed.",
    },
  ]);
});

test("complete Water readings keep their own green status when Sedapal is late", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      water: {
        commonWaterBillPresent: false,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    upcoming: {
      obligations: {
        components: {
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
          metered_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
        },
      },
    },
  }));

  assert.equal(projection.water.meterReadingsEmphasis, "compressed");
  assert.equal(projection.water.billEmphasis, "attention");
  assert.equal(projection.attentions.some((attention) => attention.happened.startsWith("Water meter readings")), false);
  assert.equal(projection.water.emphasis, "attention");
});

test("Water and Sedapal remain neutral through the sixth day", () => {
  for (const businessDate of ["2026-08-05", "2026-08-06"]) {
    const projection = projectGulianaDashboard(buildProjectionFacts({
      businessDate,
      sourceWork: {
        water: { meterReadingExpectedCount: 64 },
      },
    }));

    assert.deepEqual(projection.attentions, []);
  }
});

test("C complete water work compresses", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 4,
        meterReadingExpectedCount: 4,
        meterReadingCompleteCount: 4,
      },
    },
  }));

  assert.equal(projection.water.state, "complete");
  assert.equal(projection.water.emphasis, "compressed");
  assert.deepEqual(projection.attentions, []);
});

test("D missing Water inputs stay neutral through the sixth day", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-06",
  }));

  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.water.emphasis, "normal");
  assert.deepEqual(projection.attentions, []);
});

test("E late month without gas supplier bill does not become an exception", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
  }));

  assert.equal(projection.gas.state, "waiting");
  assert.equal(projection.gas.emphasis, "normal");
  assert.deepEqual(projection.attentions, []);
});

test("F a real canonical blocker surfaces regardless of date", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    current: {
      ...buildProjectionFacts().upcoming,
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        components: {
          ...buildProjectionFacts().upcoming.obligations.components,
          fixed_assessment: { state: "blocked", amount: null, reason: "Budget plan has not been entered yet." },
        },
      },
    },
  }));

  assert.deepEqual(projection.attentions, [
    {
      source: "obligations",
      happened: "Budget plan has not been entered yet.",
      impact: "September obligations cannot be completed.",
    },
  ]);
  assert.equal(projection.obligations.state, "blocked");
  assert.equal(projection.obligations.emphasis, "attention");
});

test("G completed obligations stay informational and do not invent approval states", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
    upcoming: {
      obligations: {
        total: "123.45",
      },
    },
  }));

  assert.equal(projection.obligations.state, "complete");
  assert.equal(projection.obligations.ready, true);
  assert.equal(projection.obligations.blocked, false);
  assert.deepEqual(projection.attentions, []);
  assert.equal("approved" in projection.obligations, false);
  assert.equal("readyForDispatch" in projection.obligations, false);
  assert.equal("dispatched" in projection.obligations, false);
});

function buildChargeFacts(charges) {
  return {
    unitRows: [
      { id: "unit-201", unit_number: "201", unit_type_code: "condo" },
      { id: "unit-202", unit_number: "202", unit_type_code: "condo" },
    ],
    charges,
  };
}

function makeUnitCharge(overrides = {}) {
  return {
    id: "charge-1",
    unit_id: "unit-201",
    owner_id: null,
    description: "Plumbing repair",
    amount: 500,
    schedule: "one_off",
    effective_from_month: "2026-09-01",
    effective_to_month: null,
    created_at: "2026-08-31T00:00:00Z",
    ...overrides,
  };
}

test("valid September Unit Charge appears once in Worth noting, not Attention", () => {
  const worthNoting = deriveUnitChargeWorthNoting(buildChargeFacts([makeUnitCharge()]), "2026-09");

  assert.deepEqual(worthNoting, [{
    kind: "unit_charge",
    unitNumber: "201",
    amount: "500",
    obligationMonth: "2026-09",
    reason: "Plumbing repair",
  }]);
  const projection = projectGulianaDashboard(buildProjectionFacts({ upcoming: { worthNoting } }));
  assert.equal(projection.worthNoting.length, 1);
  assert.deepEqual(projection.attentions, []);
});

test("multiple valid Unit Charges retain deterministic order and separate items", () => {
  const worthNoting = deriveUnitChargeWorthNoting(buildChargeFacts([
    makeUnitCharge({ id: "charge-2", unit_id: "unit-202", description: "Window repair", created_at: "2026-08-31T00:00:02Z" }),
    makeUnitCharge({ id: "charge-1", created_at: "2026-08-31T00:00:01Z" }),
  ]), "2026-09");

  assert.deepEqual(worthNoting.map((item) => item.reason), ["Plumbing repair", "Window repair"]);
  assert.equal(worthNoting.length, 2);
});

test("no Unit Charges produces no Worth noting items", () => {
  assert.deepEqual(deriveUnitChargeWorthNoting(buildChargeFacts([]), "2026-09"), []);
});

test("a Unit Charge remains Worth noting beside an independent blocker", () => {
  const worthNoting = [{
    kind: "unit_charge",
    unitNumber: "201",
    amount: "500",
    obligationMonth: "2026-09",
    reason: "Plumbing repair",
  }];
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    current: {
      ...buildProjectionFacts().upcoming,
      worthNoting,
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        components: {
          ...buildProjectionFacts().upcoming.obligations.components,
          fixed_assessment: { state: "blocked", amount: null, reason: "Budget plan has not been entered yet." },
        },
      },
    },
    upcoming: { worthNoting },
  }));

  assert.deepEqual(projection.worthNoting, worthNoting);
  assert.equal(projection.attentions.length, 1);
});

test("Guliana Worth noting follows the upcoming operational obligation period", () => {
  const worthNoting = [{
    kind: "unit_charge",
    unitNumber: "201",
    amount: "25",
    obligationMonth: "2026-10",
    reason: "DEV test charge",
  }];
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-13",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
      worthNoting: [],
    },
    upcoming: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-10" },
      worthNoting,
    },
  }));

  assert.equal(projection.financialFocus, "upcoming");
  assert.deepEqual(projection.worthNoting, worthNoting);
});

test("H partial gas work stays active and neutral before the deadline", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-05",
    sourceWork: {
      gas: {
        supplierBillCount: 1,
        gasReadingCount: 2,
        gasUnitCount: 4,
      },
    },
  }));

  assert.equal(projection.gas.state, "active");
  assert.equal(projection.gas.emphasis, "normal");
  assert.equal(projection.gas.completion, "incomplete");
  assert.deepEqual(projection.attentions, []);
});

test("late source work changes Water and Gas emphasis without financial blocking", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      water: { meterReadingExpectedCount: 64 },
      gas: { gasUnitCount: 58 },
    },
  }));

  assert.equal(projection.water.emphasis, "attention");
  assert.equal(projection.gas.emphasis, "attention");
  assert.deepEqual(projection.attentions.map((attention) => attention.happened), [
    "August Sedapal bill is still missing for September obligations.",
    "64 August Water readings are still missing for September obligations.",
    "58 August Gas readings are still missing for September obligations.",
  ]);
});

test("late Gas readings create attention independently of supplier bills", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      gas: { gasUnitCount: 58 },
    },
  }));

  assert.equal(projection.gas.emphasis, "attention");
  assert.deepEqual(projection.attentions.filter((attention) => attention.source === "gas"), [{
    source: "gas",
    happened: "58 August Gas readings are still missing for September obligations.",
    impact: "September gas obligations cannot be completed.",
  }]);
});

test("complete Gas readings keep their own green status when supplier facts differ", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      gas: { gasUnitCount: 58, gasReadingCount: 58, supplierBillCount: 0 },
    },
  }));

  assert.equal(projection.gas.readingsEmphasis, "compressed");
  assert.equal(projection.gas.supplierBillsEmphasis, "normal");
  assert.deepEqual(projection.attentions.filter((attention) => attention.source === "gas"), []);
});

test("complete Gas readings with zero supplier bills have no late attention", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      gas: { gasUnitCount: 58, gasReadingCount: 58 },
    },
  }));

  assert.equal(projection.gas.emphasis, "normal");
  assert.equal(projection.gas.supplierBillsEmphasis, "normal");
  assert.equal(projection.gas.supplierBillsPresent, false);
  assert.deepEqual(projection.attentions.filter((attention) => attention.source === "gas"), []);
});

test("I complete gas work compresses", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
    sourceWork: {
      gas: {
        supplierBillCount: 1,
        gasReadingCount: 4,
        gasUnitCount: 4,
      },
    },
  }));

  assert.equal(projection.gas.state, "complete");
  assert.equal(projection.gas.emphasis, "compressed");
  assert.equal(projection.gas.supplierBillsEmphasis, "compressed");
  assert.equal(projection.gas.supplierBillsPresent, true);
  assert.deepEqual(projection.attentions, []);
});

test("J month derivation advances from the canonical business month", () => {
  assert.deepEqual(deriveGulianaDashboardMonths(new Date("2026-08-31T00:00:00Z")), {
    operatingMonth: "2026-08",
    upcomingObligationMonth: "2026-09",
  });
  assert.deepEqual(deriveGulianaDashboardMonths(new Date("2026-09-01T00:00:00Z")), {
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
  });
  assert.deepEqual(deriveGulianaDashboardMonths(new Date("2026-09-03T00:00:00Z")), {
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
  });
});

test("J2 month-open context is only projected for the first day", () => {
  assert.equal(deriveDashboardContext(new Date("2026-08-31T00:00:00Z")), "close");
  assert.equal(deriveDashboardContext(new Date("2026-09-01T00:00:00Z")), "open");
});

test("M month-open suppresses ordinary current-month source absence", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    sourceWork: {
      water: { meterReadingExpectedCount: 64 },
      gas: { gasUnitCount: 58 },
    },
    current: {
      ...buildProjectionFacts().upcoming,
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
      },
    },
  }));

  assert.equal(projection.context, "open");
  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.gas.state, "waiting");
  assert.deepEqual(projection.attentions, []);
});

test("N month-open keeps genuine current obligation blockers", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    current: {
      ...buildProjectionFacts().upcoming,
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        components: {
          ...buildProjectionFacts().upcoming.obligations.components,
          fixed_assessment: { state: "blocked", amount: null, reason: "Budget plan has not been entered yet." },
        },
      },
    },
  }));

  assert.deepEqual(projection.attentions, [{
    source: "obligations",
    happened: "Budget plan has not been entered yet.",
    impact: "September obligations cannot be completed.",
  }]);
});

test("O month-open deduplicates the Sedapal root blocker and keeps gas independent", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    sourceWork: {
      water: { meterReadingExpectedCount: 64 },
      gas: { gasUnitCount: 58 },
    },
    current: {
      ...base,
      sourceReadingMonth: "2026-08",
      commonWaterBill: null,
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-09",
        components: {
          ...base.obligations.components,
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
          metered_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
          gas: { state: "blocked", amount: null, reason: "Required gas readings are missing." },
        },
      },
    },
  }));

  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.gas.state, "waiting");
  assert.equal(projection.obligations.readiness, "not_ready");
  assert.deepEqual(projection.attentions, [
    {
      source: "water",
      happened: "Sedapal bill is missing for August.",
      impact: "September water obligations cannot be completed.",
    },
    {
      source: "obligations",
      happened: "Required gas readings are missing.",
      impact: "September obligations cannot be completed.",
    },
  ]);
});

test("shared negative Common Water reconciliation emits one Water attention", () => {
  const reason = "Common Water pool would be negative.";
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    current: {
      ...buildProjectionFacts().upcoming,
      commonWaterBill: { id: "bill-1", amount: "100", bill_date: "2026-08-05", status: "entered" },
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        components: {
          ...buildProjectionFacts().upcoming.obligations.components,
          metered_water: { state: "blocked", amount: null, reason },
          common_water: { state: "blocked", amount: null, reason },
        },
      },
    },
  }));

  assert.deepEqual(projection.attentions, [{
    source: "obligations",
    happened: reason,
    impact: "September obligations cannot be completed.",
  }]);
});

test("shared Water reconciliation failure remains independent from Gas", () => {
  const waterReason = "Common Water pool would be negative.";
  const gasReason = "Required gas supplier bills are missing.";
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    current: {
      ...buildProjectionFacts().upcoming,
      commonWaterBill: { id: "bill-1", amount: "100", bill_date: "2026-08-05", status: "entered" },
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        components: {
          ...buildProjectionFacts().upcoming.obligations.components,
          metered_water: { state: "blocked", amount: null, reason: waterReason },
          common_water: { state: "blocked", amount: null, reason: waterReason },
          gas: { state: "blocked", amount: null, reason: gasReason },
        },
      },
    },
  }));

  assert.deepEqual(projection.attentions, [
    {
      source: "obligations",
      happened: waterReason,
      impact: "September obligations cannot be completed.",
    },
    {
      source: "obligations",
      happened: gasReason,
      impact: "September obligations cannot be completed.",
    },
  ]);
});

test("different Water blockers are not collapsed", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    current: {
      ...buildProjectionFacts().upcoming,
      commonWaterBill: { id: "bill-1", amount: "100", bill_date: "2026-08-05", status: "entered" },
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        components: {
          ...buildProjectionFacts().upcoming.obligations.components,
          metered_water: { state: "blocked", amount: null, reason: "Metered Water is invalid." },
          common_water: { state: "blocked", amount: null, reason: "Common Water is invalid." },
        },
      },
    },
  }));

  assert.equal(projection.attentions.length, 2);
});

test("P month-open projects a snapshotted package as awaiting approval", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    current: {
      ...buildProjectionFacts().upcoming,
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
      obligations: {
        ...buildProjectionFacts().upcoming.obligations,
        obligationMonth: "2026-09",
        total: "123.45",
      },
    },
  }));

  assert.equal(projection.financialFocus, "upcoming");
  assert.deepEqual(projection.handoff, {
    obligationMonth: "2026-09",
    status: "awaiting_carlos_approval",
  });
  assert.deepEqual(projection.attentions, []);
  assert.equal("approved" in projection.obligations, false);
  assert.equal("dispatched" in projection.obligations, false);
});

test("live ready-for-review package advances focus before approval snapshot", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-10-01",
    operatingMonth: "2026-10",
    upcomingObligationMonth: "2026-11",
    context: "open",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-10", total: "123.45" },
      obligationLifecycle: { mode: "live", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
    },
    upcoming: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-11", total: null },
    },
  }));

  assert.equal(projection.financialFocus, "upcoming");
  assert.deepEqual(projection.handoff, { obligationMonth: "2026-10", status: "awaiting_carlos_approval" });
});

test("P2 current live package remains in focus before the obligation month starts", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    context: "close",
    upcoming: {
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
      obligations: {
        total: "123.45",
      },
    },
  }));

  assert.equal(projection.financialFocus, "current");
  assert.equal(projection.obligations.readiness, "ready_for_carlos");
});

test("P3 a handed-off current package advances focus at a generic month boundary", () => {
  const before = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-10-31",
    context: "close",
    operatingMonth: "2026-10",
    upcomingObligationMonth: "2026-11",
    current: {
      ...buildProjectionFacts().upcoming,
      obligations: { ...buildProjectionFacts().upcoming.obligations, obligationMonth: "2026-10" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
    },
    upcoming: {
      obligations: { obligationMonth: "2026-11", total: "123.45" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-2", billingPeriodStatus: "ready_for_review" },
    },
  }));
  const onBoundary = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-11-01",
    context: "open",
    operatingMonth: "2026-11",
    upcomingObligationMonth: "2026-12",
    current: {
      ...buildProjectionFacts().upcoming,
      obligations: { ...buildProjectionFacts().upcoming.obligations, obligationMonth: "2026-11", total: "123.45" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-2", billingPeriodStatus: "ready_for_review" },
    },
  }));

  assert.equal(before.financialFocus, "upcoming");
  assert.equal(onBoundary.financialFocus, "upcoming");
  assert.equal(before.handoff?.status, "awaiting_carlos_approval");
  assert.equal(onBoundary.handoff?.status, "awaiting_carlos_approval");
});

test("consecutive handoffs keep the latest handoff separate from Giuliana's active package", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-28",
    mostRecentHandoff: { obligationMonth: "2026-10", status: "ready_for_review" },
    current: {
      ...buildProjectionFacts().upcoming,
      obligations: { ...buildProjectionFacts().upcoming.obligations, obligationMonth: "2026-11" },
      obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null },
    },
    upcoming: {
      ...buildProjectionFacts().upcoming,
      obligations: { ...buildProjectionFacts().upcoming.obligations, obligationMonth: "2026-12" },
    },
  }));

  assert.equal(projection.financialFocus, "current");
  assert.deepEqual(projection.handoff, {
    obligationMonth: "2026-10",
    status: "awaiting_carlos_approval",
  });
});

test("Sep 1 unresolved current obligations keep the current package in focus", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-09",
        components: {
          ...base.obligations.components,
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
        },
      },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialFocus, "current");
  assert.equal(projection.obligations.readiness, "not_ready");
  assert.equal(projection.water.state, "waiting");
  assert.deepEqual(projection.attentions.map((attention) => attention.happened), [
    "Sedapal bill is missing for August.",
  ]);
});

test("Sep 8 ready-for-review advances financial focus and keeps neutral source work", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "123.45" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialFocus, "upcoming");
  assert.equal(projection.handoff?.obligationMonth, "2026-09");
  assert.equal(projection.handoff?.status, "awaiting_carlos_approval");
  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.gas.state, "waiting");
  assert.deepEqual(projection.attentions, []);
});

test("Sep 8 approved current obligations advance financial focus to upcoming", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "123.45" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "approved" },
    },
    sourceWork: {
      water: { meterReadingExpectedCount: 64 },
      gas: { gasUnitCount: 58 },
    },
    upcoming: {
      ...base,
      sourceReadingMonth: "2026-09",
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-10",
        components: {
          ...base.obligations.components,
          gas: { state: "blocked", amount: null, reason: "Required gas readings are missing. Total gas consumption is zero." },
        },
      },
    },
  }));

  assert.equal(projection.financialFocus, "upcoming");
  assert.deepEqual(projection.handoff, {
    obligationMonth: "2026-09",
    status: "approved_ready_for_dispatch",
  });
  assert.deepEqual(projection.attentions, [
    {
      source: "water",
      happened: "September Sedapal bill is still missing for October obligations.",
      impact: "October water obligations cannot be completed.",
    },
    {
      source: "water",
      happened: "64 September Water readings are still missing for October obligations.",
      impact: "October water obligations cannot be completed.",
    },
    {
      source: "gas",
      happened: "58 September Gas readings are still missing for October obligations.",
      impact: "October gas obligations cannot be completed.",
    },
  ]);
});

test("approved current obligations keep a Giuliana handoff while October stays in financial focus", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "approved" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialFocus, "upcoming");
  assert.equal(projection.handoff?.obligationMonth, "2026-09");
  assert.equal(projection.handoff?.status, "approved_ready_for_dispatch");
});

test("future approved packages provide an early Giuliana handoff", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "approved" },
    },
  }));

  assert.deepEqual(projection.handoff, {
    obligationMonth: "2026-09",
    status: "approved_ready_for_dispatch",
  });
});

test("Carlos approval is not overdue through the fifth day", () => {
  for (const businessDate of ["2026-09-01", "2026-09-05"]) {
    const base = buildProjectionFacts().upcoming;
    const projection = projectCarlosDashboard(buildProjectionFacts({
      businessDate,
      operatingMonth: "2026-09",
      upcomingObligationMonth: "2026-10",
      current: {
        ...base,
        obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79" },
        obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
      },
      upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
    }));

    assert.equal(projection.approvalState, "ready");
    assert.equal(projection.journeyState, "ready_for_approval");
  }
});

test("Carlos approval is overdue from the sixth day", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.approvalState, "overdue");
  assert.equal(projection.journeyState, "approval_overdue");
});

test("Carlos approved package has no unresolved approval item", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "approved" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.approvalState, "approved");
  assert.equal(projection.journeyState, "approved");
});

test("Carlos does not expose a future persisted snapshot before its obligation month", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    operatingMonth: "2026-08",
    upcomingObligationMonth: "2026-09",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79" },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.approvalState, "not_ready");
});

test("Carlos separates Aug 31 financial readiness from approval eligibility", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79", eligibleUnitCount: 64 },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialReadiness, "ready");
  assert.equal(projection.approvalState, "not_ready");
  assert.equal(projection.journeyState, "ready");
  assert.equal(projection.total, "29369.79");
});

test("Carlos exposes concise financial blockers before handoff", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    current: {
      ...base,
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-09",
        components: {
          ...base.obligations.components,
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
          gas: { state: "blocked", amount: null, reason: "Required gas readings are missing." },
        },
      },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialReadiness, "blocked");
  assert.deepEqual(projection.financialBlockers, [
    "Sedapal water bill has not been entered yet.",
    "Required gas readings are missing.",
  ]);
  assert.equal(projection.approvalState, "not_ready");
  assert.equal(projection.journeyState, "blocked");
});

test("Carlos has approval readiness only after a calendar-eligible handoff", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    operatingMonth: "2026-09",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79", eligibleUnitCount: 64 },
      obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-1", billingPeriodStatus: "ready_for_review" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialReadiness, "ready");
  assert.equal(projection.approvalState, "ready");
  assert.equal(projection.billingPeriodId, "period-1");
});

test("Carlos keeps Unit and Owner-direct charge amounts and counts separate", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    current: {
      ...base,
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-09",
        total: "150.00",
        components: {
          ...base.obligations.components,
          other_charge: { state: "available", amount: "25.00", count: 1 },
          owner_direct_charge: { state: "available", amount: "125.00", count: 2 },
        },
      },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.deepEqual({ amount: projection.components.other_charge.amount, count: projection.components.other_charge.count }, { amount: "25.00", count: 1 });
  assert.deepEqual({ amount: projection.components.owner_direct_charge.amount, count: projection.components.owner_direct_charge.count }, { amount: "125.00", count: 2 });
});

test("Carlos keeps a complete September package non-actionable before Pulse", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-01",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-09", total: "29369.79", eligibleUnitCount: 64 },
      obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.obligationMonth, "2026-09");
  assert.equal(projection.approvalState, "not_ready");
  assert.equal(projection.journeyState, "ready");
  assert.notEqual(projection.journeyState, "ready_for_approval");
  assert.notEqual(projection.journeyState, "approval_overdue");
});

test("Carlos advances to the next active package after approval", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-10", total: null },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-11" } },
  }));

  assert.equal(projection.obligationMonth, "2026-10");
  assert.equal(projection.approvalState, "not_ready");
  assert.equal(projection.journeyState, "building");
});

test("Carlos selects the latest reviewable handoff while Giuliana keeps the active package", () => {
  const progression = {
    activePackage: { obligationMonth: "2026-12", mode: "live", status: null },
    mostRecentHandoff: { obligationMonth: "2026-11", status: "ready_for_review" },
  };

  assert.equal(selectDashboardPackageMonth({ audience: "carlos", ...progression }), "2026-11");
  assert.equal(selectDashboardPackageMonth({ audience: "giuliana", ...progression }), "2026-12");
});

test("Carlos selects the oldest pending review package while Giuliana stays on active work", () => {
  const progression = {
    activePackage: { obligationMonth: "2026-12", mode: "live", status: null },
    mostRecentHandoff: { obligationMonth: "2026-11", status: "ready_for_review" },
    pendingReviews: [
      { billingPeriodId: "october", obligationMonth: "2026-10", status: "ready_for_review", approvalEligible: true },
      { billingPeriodId: "november", obligationMonth: "2026-11", status: "ready_for_review", approvalEligible: false },
    ],
  };

  assert.equal(selectDashboardPackageMonth({ audience: "carlos", ...progression }), "2026-10");
  assert.equal(selectDashboardPackageMonth({ audience: "giuliana", ...progression }), "2026-12");
  assert.deepEqual(deriveCarlosApprovalAttentions(progression.pendingReviews).map((item) => [item.obligationMonth, item.happened]), [
    ["2026-10", "October 2026 obligations are ready for your approval"],
    ["2026-11", "November 2026 obligations are ready for review"],
  ]);
});

test("Carlos makes the next review package actionable after the oldest is resolved", () => {
  const pendingReviews = [{ billingPeriodId: "november", obligationMonth: "2026-11", status: "ready_for_review", approvalEligible: true }];
  assert.equal(selectDashboardPackageMonth({
    audience: "carlos",
    activePackage: { obligationMonth: "2026-12" },
    mostRecentHandoff: { obligationMonth: "2026-11", status: "ready_for_review" },
    pendingReviews,
  }), "2026-11");
  assert.equal(deriveCarlosApprovalAttentions(pendingReviews)[0].happened, "November 2026 obligations are ready for your approval");
});

test("Carlos review blocker copy derives the oldest other pending package", () => {
  const workspace = fs.readFileSync("app/(staff)/_components/carlos-approval-workspace.tsx", "utf8");

  assert.match(workspace, /!selectedReview\.chronologicallyActionable/);
  assert.match(workspace, /This package is ready for review\. \$\{formatMonthLabel\(blockingReview\.obligationMonth\)\} must be approved first\./);
});

test("Carlos marks a chronologically first legacy review as review-only", () => {
  const pendingReviews = [{
    billingPeriodId: "november",
    obligationMonth: "2026-11",
    status: "ready_for_review",
    outstanding: true,
    chronologicallyActionable: true,
    approvalEligible: false,
  }];
  assert.equal(deriveCarlosApprovalAttentions(pendingReviews)[0].happened, "November 2026 obligations are ready for review");
});

test("Carlos workspace keeps approval pending/success and legacy blocker states local", () => {
  const workspace = fs.readFileSync("app/(staff)/_components/carlos-approval-workspace.tsx", "utf8");
  const page = fs.readFileSync("app/(staff)/page.tsx", "utf8");
  assert.match(workspace, /useActionState/);
  assert.match(workspace, /disabled=\{approvalPending\}/);
  assert.match(workspace, /Approving \$\{formatMonthLabel\(selectedDetail\.obligationMonth\)\}/);
  assert.match(workspace, /formatMonthLabel\(approvalResult\.obligationMonth\).*approved/);
  assert.match(workspace, /Review next package/);
  assert.match(workspace, /selectedDetail\.financialBlockers\.join\(" "\)/);
  assert.doesNotMatch(workspace, /Ready for your approval<\/span>/);
  assert.doesNotMatch(page, /<CarlosApprovalWorkspace\s+key=\{projection\.pendingReviews/);
});

test("Carlos builds the next active package charge count from both charge components", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-08",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
    current: {
      ...base,
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-10",
        total: null,
        components: {
          ...base.obligations.components,
          other_charge: { state: "available", amount: "25.00", count: 1 },
          owner_direct_charge: { state: "available", amount: "125.00", count: 2 },
        },
      },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-11" } },
  }));

  assert.equal(projection.journeyState, "building");
  assert.equal((projection.components.other_charge.count ?? 0) + (projection.components.owner_direct_charge.count ?? 0), 3);
});

test("financial readiness deadlines use the final day of the preceding month", () => {
  assert.equal(financialReadinessDeadline("2026-10"), "2026-09-30");
  assert.equal(financialReadinessDeadline("2026-11"), "2026-10-31");
  assert.equal(financialReadinessDeadline("2027-02"), "2027-01-31");
  assert.equal(financialReadinessDeadline("2028-03"), "2028-02-29");
  assert.equal(financialReadinessDeadline("2027-03"), "2027-02-28");
});

test("Carlos keeps an incomplete October package building before its deadline", () => {
  const base = buildProjectionFacts().upcoming;
  for (const businessDate of ["2026-09-08", "2026-09-15", "2026-09-29"]) {
    const projection = projectCarlosDashboard(buildProjectionFacts({
      businessDate,
      operatingMonth: "2026-09",
      upcomingObligationMonth: "2026-10",
      mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
      current: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10", total: null } },
      upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-11" } },
    }));

    assert.equal(projection.journeyState, "building");
  }
});

test("Carlos blocks an incomplete October package on its readiness deadline", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-30",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
    current: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10", total: null } },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-11" } },
  }));

  assert.equal(projection.journeyState, "blocked");
});

test("Carlos is ready immediately when October becomes financially complete", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-09-20",
    operatingMonth: "2026-09",
    upcomingObligationMonth: "2026-10",
    mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth: "2026-10", total: "29369.79" },
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-11" } },
  }));

  assert.equal(projection.journeyState, "ready");
});

test("September incomplete obligations are blocked by the Aug 31 deadline", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectCarlosDashboard(buildProjectionFacts({
    businessDate: "2026-08-31",
    operatingMonth: "2026-08",
    upcomingObligationMonth: "2026-09",
    current: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-09", total: null } },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.journeyState, "blocked");
});

test("K dashboard uses the canonical active package with one bounded read", async () => {
  const originalGetBusinessNow = businessDateModule.getBusinessNow;
  const originalGetFixedBuildingIdentity = buildingModule.getFixedBuildingIdentity;
  const originalLoadBuildingMonthFinancialFacts = ownerFactsModule.loadBuildingMonthFinancialFacts;
  const originalLoadGiulianaPackageProgression = progressionModule.loadGiulianaPackageProgression;
  const obligationMonths = [];

  businessDateModule.getBusinessNow = async () => new Date("2026-09-30T00:00:00Z");
  buildingModule.getFixedBuildingIdentity = () => ({ id: "building-1", name: "Building One" });
  progressionModule.loadGiulianaPackageProgression = async () => ({
    data: {
      activePackage: { obligationMonth: "2026-09", mode: "live", status: "collecting_readings" },
      mostRecentHandoff: null,
    },
    error: null,
    requestCount: 1,
  });
  ownerFactsModule.loadBuildingMonthFinancialFacts = async ({ obligationMonth }) => {
    obligationMonths.push(obligationMonth);
    const shared = {
      planYear: 2026,
      plan: { currency: "PEN", monthly_operating_budget: "1000.00" },
      commonWaterType: { id: "cw", code: "common_water", name: "Common Water" },
      unitRows: [
        {
          id: "u-1",
          unit_number: "101",
          unit_type_id: "condo",
          unit_type_code: "condo",
          has_meter: true,
          has_gas_service: true,
          participation_percentage: 0.1,
        },
      ],
      waterReadings: [
        {
          unit_id: "u-1",
          reading_end: 100,
          consumption: 10,
          reading_date: "2026-08-28",
          created_at: "2026-08-28T00:00:00Z",
        },
      ],
      gasBills: [
        { id: "gas-2", amount: 75, processed_at: null, invoice_date: "2026-09-02" },
        { id: "gas-3", amount: 25, processed_at: null, invoice_date: "2026-09-03" },
        { id: "gas-processed", amount: 50, processed_at: "2026-09-04T00:00:00Z", invoice_date: "2026-09-04" },
      ],
      gasReadings: [
        { unit_id: "u-1", reading_month: "2026-08", current_reading: 120, previous_reading: 100, consumption: 20 },
      ],
      charges: [
        {
          id: "charge-sep",
          series_id: null,
          building_id: "building-1",
          unit_id: "u-1",
          owner_id: null,
          description: "September adjustment",
          amount: "18.00",
          schedule: "one_off",
          effective_from_month: "2026-09-01",
          effective_to_month: null,
          stop_note: null,
          legacy_table: null,
          legacy_id: null,
          legacy_metadata: null,
          created_by: "user-2",
          updated_by: null,
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        },
      ],
    };
    const data = {
      current: {
        ...shared,
        obligationMonth,
        sourceReadingMonth: "2026-08",
        commonWaterBill: null,
        waterReadings: [],
        gasReadings: [],
      },
      upcoming: {
        ...shared,
        obligationMonth: "2026-10",
        sourceReadingMonth: "2026-09",
        commonWaterBill: null,
      },
    };

    return { data, error: null, requestCount: 1, source: "remote", elapsedMs: 1 };
  };

  try {
    const result = await getGulianaDashboardFacts();

    assert.equal(result.error, null);
    assert.ok(result.data);
    assert.equal(obligationMonths.length, 1);
    assert.deepEqual(obligationMonths, ["2026-09"]);
    assert.equal(result.data?.operatingMonth, "2026-09");
    assert.equal(result.data?.upcomingObligationMonth, "2026-10");
    assert.equal(result.data?.current.obligations.obligationMonth, "2026-09");
    assert.equal(result.data?.current.sourceReadingMonth, "2026-08");
    assert.equal(result.data?.upcoming.commonWaterBill, null);
    assert.equal(result.data?.upcoming.obligations.components.common_water.state, "blocked");
    assert.equal(result.data?.upcoming.gas.supplierBillCount, 2);
    assert.equal(result.data?.upcoming.gas.supplierBillTotal, "100.00");
    assert.equal(result.data?.upcoming.charges.unitChargeCount, 0);
    assert.equal(result.data?.upcoming.obligations.obligationMonth, "2026-10");
    assert.equal(result.data?.sourceWork.water.commonWaterBillPresent, false);
    assert.equal(result.data?.sourceWork.water.meterReadingCount, 0);
    assert.equal(result.data?.sourceWork.gas.gasReadingCount, 0);
    assert.equal(result.data?.sourceWork.gas.supplierBillCount, 2);
  } finally {
    businessDateModule.getBusinessNow = originalGetBusinessNow;
    buildingModule.getFixedBuildingIdentity = originalGetFixedBuildingIdentity;
    ownerFactsModule.loadBuildingMonthFinancialFacts = originalLoadBuildingMonthFinancialFacts;
    progressionModule.loadGiulianaPackageProgression = originalLoadGiulianaPackageProgression;
  }
});

test("L late Water source attentions remain separate and deterministic", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-07",
    sourceWork: {
      water: {
        commonWaterBillPresent: false,
        meterReadingCount: 1,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 1,
      },
    },
    upcoming: {
      obligations: {
        components: {
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
          metered_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
        },
      },
    },
  }));

  assert.deepEqual(projection.attentions, [
    {
      source: "water",
      happened: "August Sedapal bill is still missing for September obligations.",
      impact: "September water obligations cannot be completed.",
    },
    {
      source: "water",
      happened: "63 August Water readings are still missing for September obligations.",
      impact: "September water obligations cannot be completed.",
    },
  ]);
});

test("future source work is not late before its collection month", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-09-28",
    sourceWork: {
      water: {
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 0,
      },
      gas: {
        gasUnitCount: 58,
        gasReadingCount: 0,
      },
    },
    current: {
      ...base,
      sourceReadingMonth: "2026-10",
      obligations: { ...base.obligations, obligationMonth: "2026-11" },
    },
  }));

  assert.deepEqual(projection.attentions, []);
  assert.equal(projection.water.meterReadingsEmphasis, "normal");
  assert.equal(projection.gas.readingsEmphasis, "normal");
});

test("future Gas calculation blockers stay out of Attention during month open", () => {
  for (const businessDate of ["2026-10-01", "2026-10-03"]) {
    const base = buildProjectionFacts().upcoming;
    const projection = projectGulianaDashboard(buildProjectionFacts({
      businessDate,
      sourceWork: {
        gas: { gasUnitCount: 58, gasReadingCount: 0 },
      },
      current: {
        ...base,
        sourceReadingMonth: "2026-10",
        obligations: {
          ...base.obligations,
          obligationMonth: "2026-11",
          components: {
            ...base.obligations.components,
            gas: { state: "blocked", amount: null, reason: "Required gas readings are missing. Total gas consumption is zero." },
          },
        },
      },
    }));

    assert.equal(projection.obligations.blocked, true);
    assert.equal(projection.gas.readingsEmphasis, "normal");
    assert.deepEqual(projection.attentions, []);
  }
});

test("future Gas calculation blockers become attention after the source deadline", () => {
  const base = buildProjectionFacts().upcoming;
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-10-07",
    sourceWork: {
      gas: { gasUnitCount: 58, gasReadingCount: 0 },
    },
    current: {
      ...base,
      sourceReadingMonth: "2026-10",
      obligations: {
        ...base.obligations,
        obligationMonth: "2026-11",
        components: {
          ...base.obligations.components,
          gas: { state: "blocked", amount: null, reason: "Required gas readings are missing. Total gas consumption is zero." },
        },
      },
    },
  }));

  assert.deepEqual(projection.attentions, [{
    source: "gas",
    happened: "58 October Gas readings are still missing for November obligations.",
    impact: "November gas obligations cannot be completed.",
  }]);
  assert.equal(projection.gas.readingsEmphasis, "attention");
});

// ---------------------------------------------------------------------------
// Delayed cycle: the active package owns the top region once its obligation
// month has begun. An earlier handoff becomes quiet completed history.

const GAS_MISSING = "Required gas readings are missing. Total gas consumption is zero.";

function delayedOctoberFacts({ businessDate, context, lifecycle, gasReadings = 0, supplierBills = 1 } = {}) {
  const base = buildProjectionFacts().upcoming;
  const october = {
    ...base,
    sourceReadingMonth: "2026-09",
    commonWaterBill: { id: "sedapal-sep", amount: "2760.50", bill_date: "2026-09-05", status: "received" },
    obligationLifecycle: lifecycle ?? { mode: "live", billingPeriodId: null, billingPeriodStatus: null },
    obligations: {
      ...base.obligations,
      obligationMonth: "2026-10",
      total: null,
      components: {
        ...base.obligations.components,
        fixed_assessment: { state: "available", amount: "20051.80", reason: null },
        metered_water: { state: "available", amount: "2709.46", reason: null },
        common_water: { state: "available", amount: "51.20", reason: null },
        gas: gasReadings >= 58 ? { state: "available", amount: "1840.03", reason: null } : { state: "blocked", amount: null, reason: GAS_MISSING },
      },
    },
  };
  return buildProjectionFacts({
    businessDate,
    context,
    operatingMonth: businessDate.slice(0, 7),
    upcomingObligationMonth: "2026-11",
    mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
    sourceWork: {
      water: { commonWaterBillPresent: true, meterReadingCount: 64, meterReadingExpectedCount: 64, meterReadingCompleteCount: 64 },
      gas: { supplierBillCount: supplierBills, gasReadingCount: gasReadings, gasUnitCount: 58 },
    },
    current: october,
    upcoming: { ...base, sourceReadingMonth: "2026-10", obligations: { ...base.obligations, obligationMonth: "2026-11" } },
  });
}

test("Oct 1: the unresolved October package owns the top region, Blocked, with September as history", () => {
  const projection = projectGulianaDashboard(delayedOctoberFacts({ businessDate: "2026-10-01", context: "open" }));

  assert.equal(projection.financialFocus, "current");
  assert.deepEqual(projection.activeResponsibility, { obligationMonth: "2026-10", state: "blocked" });
  assert.equal(projection.obligations.packageState, "blocked");
  assert.equal(projection.obligations.statusLabel, "Blocked");
  assert.deepEqual(projection.handoff, { obligationMonth: "2026-09", status: "approved_ready_for_dispatch" }, "the handoff fact stays available");
  assert.deepEqual(
    projection.completed.find((item) => item.key === "prior_obligations"),
    { key: "prior_obligations", state: "compressed", obligationMonth: "2026-09", status: "approved_ready_for_dispatch" },
  );
  assert.deepEqual(projection.attentions.map((attention) => attention.happened), [GAS_MISSING], "the blocker surfaces as a notice");
});

test("Oct 8: October stays Blocked by late September Gas readings; Water complete and quiet", () => {
  const projection = projectGulianaDashboard(delayedOctoberFacts({ businessDate: "2026-10-08" }));

  assert.deepEqual(projection.activeResponsibility, { obligationMonth: "2026-10", state: "blocked" });
  assert.equal(projection.obligations.statusLabel, "Blocked");
  assert.deepEqual(projection.attentions, [{
    source: "gas",
    happened: "58 September Gas readings are still missing for October obligations.",
    impact: "October gas obligations cannot be completed.",
  }], "Gas is the only notice: no Water attention");

  assert.equal(projection.water.domainState, "complete");
  assert.equal(projection.water.emphasis, "compressed");
  assert.equal(projection.water.meterReadingsComplete, true);
  assert.equal(projection.water.billPresent, true);
  assert.equal(projection.gas.domainState, "blocked");
  assert.equal(projection.gas.readingsEmphasis, "attention");
  assert.equal(projection.gas.supplierBillsPresent, true, "a supplier bill exists but does not complete Gas");

  assert.deepEqual(projection.completed.map((item) => item.key), ["water", "prior_obligations"]);
});

test("pre-deadline: an incomplete package is Not ready, not Blocked, and does not take the top region", () => {
  for (const businessDate of ["2026-09-08", "2026-09-29"]) {
    const projection = projectGulianaDashboard(delayedOctoberFacts({ businessDate }));
    assert.equal(projection.obligations.packageState, "not_ready", businessDate);
    assert.equal(projection.obligations.statusLabel, "Not ready", businessDate);
    assert.equal(projection.activeResponsibility, null, "October has not begun; the September handoff keeps the top line");
    assert.equal(projection.gas.domainState, "incomplete", "missing readings are not Blocking before the package boundary");
    assert.ok(!projection.completed.some((item) => item.key === "prior_obligations"));
  }
  const onDeadline = projectGulianaDashboard(delayedOctoberFacts({ businessDate: "2026-09-30" }));
  assert.equal(onDeadline.obligations.statusLabel, "Blocked", "Blocked from the readiness deadline, matching Carlos");
});

test("ready_for_review moves Giuliana's focus forward; the calendar alone does not", () => {
  const handedOff = projectGulianaDashboard(delayedOctoberFacts({
    businessDate: "2026-10-08",
    gasReadings: 58,
    lifecycle: { mode: "snapshotted", billingPeriodId: "period-oct", billingPeriodStatus: "ready_for_review" },
  }));
  assert.equal(handedOff.financialFocus, "upcoming");
  assert.equal(handedOff.obligations.statusLabel, "Live preview");
  assert.equal(handedOff.activeResponsibility, null, "November has not begun");

  const live = projectGulianaDashboard(delayedOctoberFacts({ businessDate: "2026-10-31" }));
  assert.equal(live.financialFocus, "current", "late in October the unresolved October package still holds focus");
  assert.equal(live.activeResponsibility?.obligationMonth, "2026-10");
});

test("two domain cards: Gas completes on readings, not on supplier-bill presence", () => {
  const readingsComplete = projectGulianaDashboard(delayedOctoberFacts({ businessDate: "2026-10-08", gasReadings: 58, supplierBills: 0 }));
  assert.equal(readingsComplete.gas.domainState, "complete", "an empty supplier pool is valid");
  assert.equal(readingsComplete.water.domainState, "complete");

  const page = fs.readFileSync(new URL("../app/(staff)/page.tsx", import.meta.url), "utf8");
  assert.match(page, /title="Water" state=\{projection\.water\.domainState\}/);
  assert.match(page, /title="Gas" state=\{projection\.gas\.domainState\}/);
  assert.doesNotMatch(page, /xl:grid-cols-4/, "the four separate source cards are gone");
  assert.match(page, /projection\.obligations\.statusLabel/);
  assert.match(page, /projection\.completed\.map/);
});

// Carlos obligation journey restoration (FIN-008 two-clock reading).
function carlosJourney({ businessDate, obligationMonth = "2026-10", total = "26240.50", lifecycle, components }) {
  const base = buildProjectionFacts().upcoming;
  return projectCarlosDashboard(buildProjectionFacts({
    businessDate,
    operatingMonth: businessDate.slice(0, 7),
    upcomingObligationMonth: "2026-11",
    mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
    current: {
      ...base,
      obligations: { ...base.obligations, obligationMonth, total, ...(components ? { components: { ...base.obligations.components, ...components } } : {}) },
      ...(lifecycle ? { obligationLifecycle: lifecycle } : {}),
    },
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-11" } },
  }));
}

const sedapalMissing = { common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." } };
const handedOff = (status) => ({ mode: "snapshotted", billingPeriodId: "period-oct", billingPeriodStatus: status });

test("Carlos journey: incomplete before the readiness deadline is quiet Building", () => {
  const projection = carlosJourney({ businessDate: "2026-09-20", total: null, components: sedapalMissing });
  assert.equal(projection.journeyState, "building");
  assert.equal(projection.journeyLabel, "Building");
  assert.equal(projection.approvalState, "not_ready");
});

test("Carlos journey: incomplete on or after the readiness deadline is Blocked with source blockers", () => {
  for (const businessDate of ["2026-09-30", "2026-10-06", "2026-11-02"]) {
    const projection = carlosJourney({ businessDate, total: null, components: sedapalMissing });
    assert.equal(projection.journeyState, "blocked", businessDate);
    assert.equal(projection.journeyLabel, "Blocked");
    assert.deepEqual(projection.financialBlockers, ["Sedapal water bill has not been entered yet."]);
    assert.equal(projection.approvalState, "not_ready");
  }
});

test("Carlos journey: complete but not handed off is Ready for handoff and never actionable", () => {
  for (const businessDate of ["2026-10-09", "2026-11-03"]) {
    const projection = carlosJourney({ businessDate });
    assert.equal(projection.journeyState, "ready", businessDate);
    assert.equal(projection.journeyLabel, "Ready for handoff");
    assert.equal(projection.approvalState, "not_ready");
    assert.equal(projection.billingPeriodId, null);
    assert.deepEqual(projection.pendingReviews, []);
  }
});

test("Carlos journey: ready_for_review in its month is Ready for your approval", () => {
  const projection = carlosJourney({ businessDate: "2026-10-03", lifecycle: handedOff("ready_for_review") });
  assert.equal(projection.journeyState, "ready_for_approval");
  assert.equal(projection.journeyLabel, "Ready for your approval");
  assert.equal(projection.approvalState, "ready");
});

test("Carlos journey: the sixth-day overdue rule is preserved", () => {
  const projection = carlosJourney({ businessDate: "2026-10-06", lifecycle: handedOff("ready_for_review") });
  assert.equal(projection.journeyState, "approval_overdue");
  assert.equal(projection.journeyLabel, "Approval overdue");
});

test("Carlos journey: a ready_for_review package carried into a later month stays actionable and overdue", () => {
  for (const businessDate of ["2026-11-01", "2026-11-03", "2027-01-15"]) {
    const projection = carlosJourney({ businessDate, lifecycle: handedOff("ready_for_review") });
    assert.equal(projection.obligationMonth, "2026-10");
    assert.equal(projection.approvalState, "overdue", businessDate);
    assert.equal(projection.journeyState, "approval_overdue");
    assert.notEqual(projection.journeyState, "ready", "a handed-off package never falls back to Ready for handoff");
  }
});

test("Carlos journey: an approved package carried into a later month remains approved", () => {
  const projection = carlosJourney({ businessDate: "2026-11-03", lifecycle: handedOff("approved") });
  assert.equal(projection.approvalState, "approved");
  assert.equal(projection.journeyState, "approved");
  assert.equal(projection.journeyLabel, "Approved");
});

test("Carlos journey: a future-month package is not actionable because of the FIN-008 comparison", () => {
  for (const status of ["ready_for_review", "approved"]) {
    const projection = carlosJourney({ businessDate: "2026-09-28", lifecycle: handedOff(status) });
    assert.equal(projection.approvalState, "not_ready", status);
    assert.ok(!["ready_for_approval", "approval_overdue", "approved"].includes(projection.journeyState), status);
  }
});

test("Carlos dashboard restores the journey region without the old inline approval card", () => {
  const page = fs.readFileSync("app/(staff)/page.tsx", "utf8");
  const carlos = page.slice(page.indexOf("async function CarlosDashboardPage"), page.indexOf("export default async function DashboardPage"));
  assert.match(carlos, /\{formatMonthLabel\(projection\.obligationMonth\)\} obligations<\/p>/);
  assert.match(carlos, /<p className="text-xl font-semibold text-zinc-950">\{journeyStatus\}<\/p>/);
  assert.match(carlos, /projection\.journeyState === "blocked" \? \(\s*<ul[\s\S]*?projection\.financialBlockers\.map/);
  assert.match(carlos, /noteworthy \{noteworthy\.length === 1 \? "charge" : "charges"\}/);
  assert.match(carlos, /projection\.journeyLabel/);
  assert.match(carlos, /<CarlosApprovalWorkspace/);
  assert.match(carlos, /Financial watch/);
  assert.doesNotMatch(carlos, /<form action=\{approveMonthlyObligationAction\}/, "no inline approval card");
  assert.doesNotMatch(carlos, /dispatch/i);
});

test("Carlos floating Obligations control exists before handoff and opens the package read-only", () => {
  const workspace = fs.readFileSync("app/(staff)/_components/carlos-approval-workspace.tsx", "utf8");
  assert.match(workspace, /const journeyMonth = actionable\?\.obligationMonth \?\? projection\.obligationMonth;/);
  assert.match(workspace, /\) : \(\s*<button[\s\S]*?onClick=\{\(\) => openMonth\(journeyMonth\)\}[\s\S]*?\{journeyLabel\}/);
  assert.match(workspace, /projection\.journeyLabel/);
  assert.match(workspace, /Source inputs are complete\. This package is waiting for automatic handoff\./);
  assert.doesNotMatch(workspace, /hand ?off (it|this package) manually|manual handoff/i);
});

test("Carlos modal keeps the existing approval gate, so a package before handoff has no Approve action", () => {
  const workspace = fs.readFileSync("app/(staff)/_components/carlos-approval-workspace.tsx", "utf8");
  const gates = workspace.match(/<form action=\{approvalFormAction\}>/g) ?? [];
  assert.equal(gates.length, 1);
  assert.match(workspace, /\{selectedDetail\.billingPeriodStatus === "ready_for_review" && selectedDetail\.financialReadiness === "ready" && projection\.pendingReviews\.some\(\(review\) => review\.obligationMonth === selectedDetail\.obligationMonth && review\.approvalEligible\) \? \(\s*<form action=\{approvalFormAction\}>/);
  assert.match(workspace, /name="reviewFingerprint" value=\{selectedDetail\.reviewFingerprint\}/);
  assert.match(workspace, /commonWaterRoundingText\(component\)/);
});

test("Giuliana Supplier Bills card links to the Gas bills workspace", () => {
  const page = fs.readFileSync("app/(staff)/page.tsx", "utf8");
  assert.match(page, /<Link href="\/gas\/bills" className="rounded-2xl[^"]*">\s*<span className="text-lg font-normal text-zinc-950">Supplier Bills<\/span>/);
});
