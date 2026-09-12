import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { canApproveMonthlyObligation, validateApprovalTransition } = jiti("./approval.ts");
const approval = jiti("./approval.ts");
const cache = jiti("./building-month-cache.ts");
const supabaseServer = jiti("@/lib/supabase/server");
const staffContextModule = jiti("@/server/staff-context");

test("only super admins can approve Monthly Obligations", () => {
  assert.equal(canApproveMonthlyObligation(["super_admin"]), true);
  assert.equal(canApproveMonthlyObligation(["building_manager"]), false);
});

test("approval transition accepts ready-for-review and is idempotent for approved", () => {
  assert.deepEqual(validateApprovalTransition("ready_for_review"), { ok: true, idempotent: false });
  assert.deepEqual(validateApprovalTransition("approved"), { ok: true, idempotent: true });
});

test("approval transition rejects invalid lifecycle states", () => {
  assert.deepEqual(validateApprovalTransition("draft"), {
    ok: false,
    error: "Billing Period cannot be approved from status draft.",
  });
});

test("DEV approval reset only accepts approved periods", () => {
  assert.deepEqual(approval.validateDevApprovalReset("approved"), { ok: true });
  assert.deepEqual(approval.validateDevApprovalReset("ready_for_review"), {
    ok: false,
    error: "DEV approval reset is only available for an approved Billing Period.",
  });
});

test("successful approval invalidates the exact building-month facts cache", { concurrency: false }, async () => {
  const originalCreateClient = supabaseServer.createClient;
  const originalGetStaffContext = staffContextModule.getStaffContext;
  const buildingId = "b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810";
  cache.invalidateBuildingMonthFinancialFactsCache();
  cache.setCachedBuildingMonthFinancialFacts(buildingId, "2026-09", {}, 1);
  let maybeSingleCalls = 0;

  staffContextModule.getStaffContext = async () => ({
    user: { id: "staff-1" },
    staffProfile: { display_name: "Carlos" },
    roleKeys: ["super_admin"],
    primaryRoleKey: "super_admin",
  });
  supabaseServer.createClient = async () => ({
    from() {
      return this;
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    update() {
      return this;
    },
    maybeSingle() {
      maybeSingleCalls += 1;
      return Promise.resolve(maybeSingleCalls === 1
        ? { data: { id: "period-1", status: "ready_for_review", period_year: 2026, period_month: 9 }, error: null }
        : { data: { status: "approved" }, error: null });
    },
  });

  try {
    const result = await approval.approveMonthlyObligation({ billingPeriodId: "period-1" });
    assert.deepEqual(result, { data: { status: "approved" }, error: null });
    assert.equal(cache.getCachedBuildingMonthFinancialFacts(buildingId, "2026-09"), null);
  } finally {
    cache.invalidateBuildingMonthFinancialFactsCache();
    supabaseServer.createClient = originalCreateClient;
    staffContextModule.getStaffContext = originalGetStaffContext;
  }
});
