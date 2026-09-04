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

const { projectGulianaDashboard, deriveGulianaDashboardMonths, getGulianaDashboardFacts } = dashboard;

function buildProjectionFacts(overrides = {}) {
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

  return {
    businessDate: overrides.businessDate ?? "2026-08-05",
    operatingMonth: "2026-08",
    upcomingObligationMonth: "2026-09",
    sourceWork,
    upcoming: {
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
    },
  };
}

test("A month open stays calm and produces no manufactured exceptions", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts());
  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.gas.state, "waiting");
  assert.deepEqual(projection.exceptions, []);
});

test("B early month with partial water work surfaces a water attention item", () => {
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
  assert.deepEqual(projection.exceptions, [
    { source: "water", message: "Required water readings are missing." },
  ]);
});

test("B2 incomplete required water readings surface a water attention item", () => {
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
  assert.deepEqual(projection.exceptions, [
    { source: "water", message: "Required water readings are missing." },
    { source: "obligations", message: "Sedapal water bill has not been entered yet." },
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
  assert.deepEqual(projection.exceptions, []);
});

test("D late month without Sedapal bill does not become an exception", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
  }));

  assert.equal(projection.water.state, "waiting");
  assert.equal(projection.water.emphasis, "normal");
  assert.deepEqual(projection.exceptions, []);
});

test("E late month without gas supplier bill does not become an exception", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-15",
  }));

  assert.equal(projection.gas.state, "waiting");
  assert.equal(projection.gas.emphasis, "normal");
  assert.deepEqual(projection.exceptions, []);
});

test("F a real canonical blocker surfaces regardless of date", () => {
  const projection = projectGulianaDashboard(buildProjectionFacts({
    businessDate: "2026-08-20",
    upcoming: {
      obligations: {
        components: {
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
        },
      },
    },
  }));

  assert.deepEqual(projection.exceptions, [
    { source: "obligations", message: "Sedapal water bill has not been entered yet." },
  ]);
  assert.equal(projection.water.state, "blocked");
  assert.equal(projection.water.emphasis, "attention");
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
  assert.deepEqual(projection.exceptions, []);
  assert.equal("approved" in projection.obligations, false);
  assert.equal("readyForDispatch" in projection.obligations, false);
  assert.equal("dispatched" in projection.obligations, false);
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

test("K dashboard facts read uses exactly one bounded month read", async () => {
  const originalGetBusinessNow = businessDateModule.getBusinessNow;
  const originalGetFixedBuildingIdentity = buildingModule.getFixedBuildingIdentity;
  const originalLoadBuildingMonthFinancialFacts = ownerFactsModule.loadBuildingMonthFinancialFacts;
  const obligationMonths = [];

  businessDateModule.getBusinessNow = async () => new Date("2026-08-31T00:00:00Z");
  buildingModule.getFixedBuildingIdentity = () => ({ id: "building-1", name: "Building One" });
  ownerFactsModule.loadBuildingMonthFinancialFacts = async ({ obligationMonth }) => {
    obligationMonths.push(obligationMonth);
    const data = {
      obligationMonth,
      sourceReadingMonth: "2026-08",
      planYear: 2026,
      plan: { currency: "PEN", monthly_operating_budget: "1000.00" },
      commonWaterType: { id: "cw", code: "common_water", name: "Common Water" },
      commonWaterBill: null,
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

    return { data, error: null, requestCount: 1, source: "remote", elapsedMs: 1 };
  };

  try {
    const result = await getGulianaDashboardFacts();

    assert.equal(result.error, null);
    assert.ok(result.data);
    assert.equal(obligationMonths.length, 1);
    assert.deepEqual(obligationMonths, ["2026-09"]);
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
    upcoming: {
      obligations: {
        components: {
          common_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
          metered_water: { state: "blocked", amount: null, reason: "Sedapal water bill has not been entered yet." },
        },
      },
    },
  }));

  assert.deepEqual(projection.exceptions, [
    { source: "obligations", message: "Sedapal water bill has not been entered yet." },
  ]);
});
