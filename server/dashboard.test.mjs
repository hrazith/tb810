import test from "node:test";
import assert from "node:assert/strict";
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

const { projectGulianaDashboard, deriveUnitChargeWorthNoting, deriveGulianaDashboardMonths, deriveDashboardContext, getGulianaDashboardFacts } = dashboard;

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

test("B early month with partial water work surfaces only the water-readings attention", () => {
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
  assert.deepEqual(projection.attentions, [
    {
      source: "water",
      happened: "2 of 4 water readings are missing.",
      impact: "September water obligations cannot be completed.",
    },
  ]);
});

test("B2 missing Sedapal plus incomplete water readings surfaces two water attentions", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
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
      happened: "Sedapal bill is missing for August.",
      impact: "September water obligations cannot be completed.",
    },
    {
      source: "water",
      happened: "63 of 64 water readings are missing.",
      impact: "September water obligations cannot be completed.",
    },
  ]);
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

test("D late month without Sedapal bill does not become an exception", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
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
    businessDate: "2026-08-20",
    upcoming: {
      obligations: {
        components: {
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
    upcoming: {
      worthNoting,
      obligations: {
        components: {
          fixed_assessment: { state: "blocked", amount: null, reason: "Budget plan has not been entered yet." },
        },
      },
    },
  }));

  assert.deepEqual(projection.worthNoting, worthNoting);
  assert.equal(projection.attentions.length, 1);
});

test("H partial gas work stays active and normal", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
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
  assert.deepEqual(projection.attentions, [
    {
      source: "gas",
      happened: "2 of 4 gas readings are missing.",
      impact: "September gas obligations cannot be completed.",
    },
  ]);
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
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    upcoming: {
      obligations: {
        components: {
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
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    upcoming: {
      obligations: {
        components: {
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
    sourceWork: {
      water: {
        commonWaterBillPresent: true,
        meterReadingCount: 64,
        meterReadingExpectedCount: 64,
        meterReadingCompleteCount: 64,
      },
    },
    upcoming: {
      obligations: {
        components: {
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

  assert.equal(projection.obligations.readiness, "awaiting_approval");
  assert.equal(projection.obligations.ready, true);
  assert.deepEqual(projection.attentions, []);
  assert.equal("approved" in projection.obligations, false);
  assert.equal("dispatched" in projection.obligations, false);
});

test("P2 future snapshots remain live preview before the obligation month starts", () => {
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

  assert.equal(projection.financialFocus, "upcoming");
  assert.equal(projection.obligations.readiness, "ready_for_carlos");
});

test("P3 an equivalent generic month boundary exposes the snapshot on month one", () => {
  const before = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-10-31",
    context: "close",
    operatingMonth: "2026-10",
    upcomingObligationMonth: "2026-11",
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
  assert.equal(onBoundary.financialFocus, "current");
  assert.equal(before.obligations.readiness, "ready_for_carlos");
  assert.equal(onBoundary.obligations.readiness, "awaiting_approval");
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

test("Sep 8 ready-for-review keeps current financials and neutral source work", () => {
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

  assert.equal(projection.financialFocus, "current");
  assert.equal(projection.obligations.readiness, "awaiting_approval");
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
    upcoming: { ...base, obligations: { ...base.obligations, obligationMonth: "2026-10" } },
  }));

  assert.equal(projection.financialFocus, "upcoming");
});

test("K dashboard facts read uses exactly one bounded month read", async () => {
  const originalGetBusinessNow = businessDateModule.getBusinessNow;
  const originalGetFixedBuildingIdentity = buildingModule.getFixedBuildingIdentity;
  const originalLoadBuildingMonthFinancialFacts = ownerFactsModule.loadBuildingMonthFinancialFacts;
  const obligationMonths = [];

  businessDateModule.getBusinessNow = async () => new Date("2026-08-31T00:00:00Z");
  buildingModule.getFixedBuildingIdentity = () => ({ id: "building-1", name: "Building One" });
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
        sourceReadingMonth: "2026-07",
        commonWaterBill: null,
        waterReadings: [],
        gasReadings: [],
      },
      upcoming: {
        ...shared,
        obligationMonth: "2026-09",
        sourceReadingMonth: "2026-08",
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
    assert.deepEqual(obligationMonths, ["2026-08"]);
    assert.equal(result.data?.operatingMonth, "2026-08");
    assert.equal(result.data?.upcomingObligationMonth, "2026-09");
    assert.equal(result.data?.upcoming.commonWaterBill, null);
    assert.equal(result.data?.upcoming.obligations.components.common_water.state, "blocked");
    assert.equal(result.data?.upcoming.gas.supplierBillCount, 2);
    assert.equal(result.data?.upcoming.gas.supplierBillTotal, "100.00");
    assert.equal(result.data?.upcoming.charges.unitChargeCount, 1);
    assert.equal(result.data?.upcoming.obligations.obligationMonth, "2026-09");
    assert.equal(result.data?.sourceWork.water.commonWaterBillPresent, false);
    assert.equal(result.data?.sourceWork.water.meterReadingCount, 1);
    assert.equal(result.data?.sourceWork.gas.gasReadingCount, 1);
  } finally {
    businessDateModule.getBusinessNow = originalGetBusinessNow;
    buildingModule.getFixedBuildingIdentity = originalGetFixedBuildingIdentity;
    ownerFactsModule.loadBuildingMonthFinancialFacts = originalLoadBuildingMonthFinancialFacts;
  }
});

test("L duplicate canonical exceptions are deduplicated deterministically", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
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
      happened: "Sedapal bill is missing for August.",
      impact: "September water obligations cannot be completed.",
    },
    {
      source: "water",
      happened: "63 of 64 water readings are missing.",
      impact: "September water obligations cannot be completed.",
    },
  ]);
});
