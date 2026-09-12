import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const approval = jiti("./approval.ts");
const cache = jiti("./building-month-cache.ts");
const supabaseServer = jiti("@/lib/supabase/server");
const businessDateModule = jiti("@/server/business-date");
const devSessionModule = jiti("@/server/dev-test-session");

test("DEV approval reset clears approval metadata and invalidates only the current period", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCreateClient = supabaseServer.createClient;
  const originalGetBusinessNow = businessDateModule.getBusinessNow;
  const originalGetActiveDevTestSessionSummary = devSessionModule.getActiveDevTestSessionSummary;
  const buildingId = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";
  const updates = [];
  cache.invalidateBuildingMonthFinancialFactsCache();
  cache.setCachedBuildingMonthFinancialFacts(buildingId, "2026-09", {}, 1);

  process.env.NODE_ENV = "development";
  businessDateModule.getBusinessNow = async () => new Date("2026-09-11T00:00:00Z");
  devSessionModule.getActiveDevTestSessionSummary = async () => ({ id: "session-1", mutationCount: 0 });
  supabaseServer.createClient = async () => ({
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve(table === "tb810_billing_periods"
          ? (updates.length
            ? { data: { status: "ready_for_review", approved_at: null, approved_by: null }, error: null }
            : { data: { id: "period-1", status: "approved", period_year: 2026, period_month: 9 }, error: null })
          : { data: { id: "session-1", status: "active" }, error: null }),
        update(payload) {
          updates.push(payload);
          return query;
        },
      };
      return query;
    },
  });

  try {
    const result = await approval.resetCurrentMonthlyObligationApprovalForDev();
    assert.deepEqual(result, { data: { status: "ready_for_review" }, error: null });
    assert.deepEqual(updates, [{ status: "ready_for_review", approved_at: null, approved_by: null }]);
    assert.equal(cache.getCachedBuildingMonthFinancialFacts(buildingId, "2026-09"), null);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    cache.invalidateBuildingMonthFinancialFactsCache();
    supabaseServer.createClient = originalCreateClient;
    businessDateModule.getBusinessNow = originalGetBusinessNow;
    devSessionModule.getActiveDevTestSessionSummary = originalGetActiveDevTestSessionSummary;
  }
});
