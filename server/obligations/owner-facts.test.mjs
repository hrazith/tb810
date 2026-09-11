import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});

const { monthKeyToDate, loadBuildingMonthFinancialFacts } = jiti("./owner-facts.ts");
const cache = jiti("./building-month-cache.ts");
const supabaseServer = jiti("@/lib/supabase/server");

test("building month facts RPC receives a SQL date for source reading month", () => {
  assert.equal(monthKeyToDate("2026-07"), "2026-07-01");
  assert.equal(monthKeyToDate("2026-08"), "2026-08-01");
});

test("dual-period facts keep Aug 31 and Sep 1 source periods distinct", { concurrency: false }, async () => {
  const originalCreateClient = supabaseServer.createClient;
  const rpcCalls = [];
  const augustBuildingId = "dual-period-august-building";
  const septemberBuildingId = "dual-period-september-building";
  cache.invalidateBuildingMonthFinancialFactsCache();
  supabaseServer.createClient = async () => ({
    rpc(name, args) {
      rpcCalls.push([name, args]);
      const missing = args.p_building_id === "missing-bill-building";
      return Promise.resolve({
        data: {
          currentPlan: { currency: "PEN", monthly_operating_budget: "1000.00" },
          upcomingPlan: { currency: "PEN", monthly_operating_budget: "1000.00" },
          commonWaterType: { id: "cw", code: "common_water", name: "Common Water" },
          unitRows: [],
          gasBills: [],
          charges: [],
          current: {
            commonWaterBill: missing ? null : { id: "water-july", amount: 10 },
            waterReadings: missing ? [] : [{ unit_id: "july-unit", reading_date: "2026-07-31", reading_end: 1 }],
          gasReadings: missing ? [] : [{ unit_id: "july-unit", reading_month: "2026-07", consumption: 1 }],
            obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-september", billingPeriodStatus: "ready_for_review" },
            obligationSnapshot: { billingPeriodId: "period-september", status: "ready_for_review", components: {}, total: 0 },
          },
          upcoming: {
            commonWaterBill: missing ? null : { id: "water-august", amount: 20 },
            waterReadings: missing ? [] : [{ unit_id: "august-unit", reading_date: "2026-08-31", reading_end: 2 }],
          gasReadings: missing ? [] : [{ unit_id: "august-unit", reading_month: "2026-08", consumption: 2 }],
            obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null },
            obligationSnapshot: null,
          },
        },
        error: null,
      });
    },
  });

  try {
    const missingBill = await loadBuildingMonthFinancialFacts({
      buildingId: "missing-bill-building",
      obligationMonth: "2026-09",
    });
    assert.equal(missingBill.data?.current.commonWaterBill, null);
    assert.equal(missingBill.requestCount, 1);

    const aug31 = await loadBuildingMonthFinancialFacts({
      buildingId: augustBuildingId,
      obligationMonth: "2026-08",
    });
    assert.equal(aug31.data?.current.obligationMonth, "2026-08");
    assert.equal(aug31.data?.current.sourceReadingMonth, "2026-07");
    assert.equal(aug31.data?.upcoming.obligationMonth, "2026-09");
    assert.equal(aug31.data?.upcoming.sourceReadingMonth, "2026-08");
    assert.equal(aug31.data?.current.waterReadings[0]?.unit_id, "july-unit");
    assert.equal(aug31.data?.upcoming.waterReadings[0]?.unit_id, "august-unit");
    assert.equal(aug31.data?.current.gasReadings[0]?.reading_month, "2026-07");
    assert.equal(aug31.data?.upcoming.gasReadings[0]?.reading_month, "2026-08");
    assert.equal(aug31.data?.current.obligationLifecycle.mode, "snapshotted");
    assert.equal(aug31.data?.upcoming.obligationLifecycle.mode, "live");
    assert.equal(rpcCalls.length, 2);
    assert.equal(rpcCalls[1][1].p_reading_month, "2026-07-01");

    const aug31Cached = await loadBuildingMonthFinancialFacts({
      buildingId: augustBuildingId,
      obligationMonth: "2026-08",
    });
    assert.equal(aug31Cached.source, "cached");
    assert.equal(aug31Cached.requestCount, 0);
    assert.equal(rpcCalls.length, 2);

    const sep1 = await loadBuildingMonthFinancialFacts({
      buildingId: septemberBuildingId,
      obligationMonth: "2026-09",
    });
    assert.equal(sep1.data?.current.obligationMonth, "2026-09");
    assert.equal(sep1.data?.current.sourceReadingMonth, "2026-08");
    assert.equal(sep1.data?.upcoming.obligationMonth, "2026-10");
    assert.equal(sep1.data?.upcoming.sourceReadingMonth, "2026-09");
    assert.equal(rpcCalls.length, 3);
    assert.equal(rpcCalls[2][1].p_reading_month, "2026-08-01");
  } finally {
    cache.invalidateBuildingMonthFinancialFactsCache();
    supabaseServer.createClient = originalCreateClient;
  }
});
