import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

// Kept in its own file: these tests patch shared module bindings and must not
// overlap with other async approval tests.
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const approval = jiti("./approval.ts");
const supabaseServer = jiti("@/lib/supabase/server");
const staffContextModule = jiti("@/server/staff-context");

test("stale Sedapal provenance maps to the operator-safe review-again message", () => {
  assert.equal(
    approval.mapApprovalRpcError("Sedapal source changed after review for the 2026-10 Monthly Obligations package."),
    "The Monthly Obligations package changed. Review it again before approving.",
  );
  for (const message of [
    "Sedapal source bill is missing for the 2026-10 Monthly Obligations package.",
    "Sedapal source is ambiguous for the 2026-10 Monthly Obligations package: 2 Common Water bills are attached.",
    "Sedapal provenance is missing from the 2026-10 Monthly Obligations package.",
    "An earlier Monthly Obligation must be approved first.",
  ]) {
    assert.equal(approval.mapApprovalRpcError(message), message);
  }
});

test("approval rejected for stale Sedapal provenance returns review-again and no approval data", { concurrency: false }, async () => {
  const originalCreateClient = supabaseServer.createClient;
  const originalGetStaffContext = staffContextModule.getStaffContext;
  const rpcNames = [];

  staffContextModule.getStaffContext = async () => ({
    user: { id: "staff-1" },
    staffProfile: { display_name: "Carlos" },
    roleKeys: ["super_admin"],
    primaryRoleKey: "super_admin",
  });
  supabaseServer.createClient = async () => ({
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    maybeSingle() {
      return Promise.resolve({ data: { id: "period-10", status: "ready_for_review", period_year: 2026, period_month: 10 }, error: null });
    },
    rpc(name) {
      rpcNames.push(name);
      if (name === "tb810_get_building_month_financial_facts") {
        return Promise.resolve({
          data: {
            currentPlan: null, upcomingPlan: null, commonWaterType: null, unitRows: [], gasBills: [], charges: [],
            current: {
              commonWaterBill: null, waterReadings: [], gasReadings: [],
              obligationLifecycle: { mode: "snapshotted", billingPeriodId: "period-10", billingPeriodStatus: "ready_for_review" },
              obligationSnapshot: { billingPeriodId: "period-10", status: "ready_for_review", components: {}, total: "0" },
            },
            upcoming: {
              commonWaterBill: null, waterReadings: [], gasReadings: [],
              obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null },
              obligationSnapshot: null,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { message: "Sedapal source changed after review for the 2026-10 Monthly Obligations package." },
      });
    },
  });

  try {
    const result = await approval.approveMonthlyObligation({ billingPeriodId: "period-10" });
    assert.deepEqual(result, { data: null, error: "The Monthly Obligations package changed. Review it again before approving." });
    assert.deepEqual(rpcNames, ["tb810_get_building_month_financial_facts", "tb810_approve_monthly_obligation"]);
  } finally {
    supabaseServer.createClient = originalCreateClient;
    staffContextModule.getStaffContext = originalGetStaffContext;
  }
});
