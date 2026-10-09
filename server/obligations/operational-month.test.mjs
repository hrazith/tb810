import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createJiti from "jiti";

// FIN-008 operational/source clock. SQL behavior is pinned statically here and
// was exercised against a disposable local Postgres with every migration
// applied; the node suite cannot execute SQL.

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const migration = fs.readFileSync("supabase/migrations/20261009140000_pulse_operational_month_container.sql", "utf8");
const body = migration.slice(migration.indexOf("as $$"), migration.lastIndexOf("$$;"));

const pulseModule = jiti("./pulse.ts");
const progressionModule = jiti("./progression.ts");
const snapshotModule = jiti("./snapshot.ts");
const businessDateModule = jiti("@/server/business-date");
const buildingModule = jiti("@/server/building");
const systemModule = jiti("@/server/supabase/system");
const serverClientModule = jiti("@/lib/supabase/server");
const { isHandedOffPackage, selectFinancialFocus, selectGiulianaWorkspaceMonth } = jiti("./package-selection.ts");
const { selectGasBillsForLifecycle } = jiti("./owner-facts.ts");
const { isSourceMonthEditable } = jiti("../water/source-editability.ts");
const { isCommonWaterBillEditable } = jiti("../water/types.ts");

test("ensure is a system-only SECURITY DEFINER function with service_role authority", () => {
  assert.match(migration, /create or replace function public\.tb810_ensure_operational_billing_period_system\(\s*p_building_id uuid\s*\)\s*returns jsonb\s*language plpgsql\s*security definer\s*set search_path = public/);
  assert.match(body, /if auth\.role\(\) <> 'service_role' then\s+raise exception 'System execution requires the Supabase service role\.';/);
  assert.match(migration, /revoke all on function public\.tb810_ensure_operational_billing_period_system\(uuid\)\s+from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.tb810_ensure_operational_billing_period_system\(uuid\) to service_role;/);
  assert.equal([...migration.matchAll(/grant /gi)].length, 1);
});

test("the month comes from the database UTC clock, never from the caller", () => {
  assert.match(body, /v_month date := date_trunc\('month', timezone\('utc', now\(\)\)\)::date;/);
  assert.doesNotMatch(migration, /p_(period_)?(year|month)|p_operating/);
});

test("ensure inserts collecting_readings idempotently and never updates an existing row", () => {
  assert.match(body, /insert into public\.tb810_billing_periods \(building_id, period_year, period_month, starts_on, ends_on, status\)/);
  assert.match(body, /'collecting_readings'\s*\)\s*on conflict \(building_id, period_year, period_month\) do nothing\s*returning id into v_period_id;/);
  assert.doesNotMatch(body, /\bupdate\b|\bdelete\b|do update/i);
  assert.match(body, /'billingPeriodId', v_period_id,\s*'month', to_char\(v_month, 'YYYY-MM'\),\s*'created', v_created/);
});

test("ensure has no handoff, approval, obligation, Gas or source side effects", () => {
  for (const forbidden of [
    /ready_for_review_internal|mark_monthly_obligation|approve_monthly_obligation|persist_monthly_obligation/,
    /tb810_monthly_financial_obligations/,
    /tb810_gas_bills|gas_reservation_state|reserved_billing_period_id|tb810\.gas_lifecycle_write/,
    /tb810_utility_bills|tb810_meter_readings|tb810_gas_readings|tb810_charges/,
    /'ready_for_review'|'approved'|approved_at|approved_by/,
  ]) {
    assert.doesNotMatch(body, forbidden);
  }
  assert.equal([...migration.matchAll(/create (or replace )?function/gi)].length, 1);
});

// jiti binds an imported function on first use, so the stubs are installed
// once for this file (node --test isolates each file in its own process) and
// delegate to per-test handlers.
const pulseEnv = { calls: [], ensure: () => assert.fail("ensure handler not set") };
const ensureClient = {
  rpc: async (name, args) => {
    pulseEnv.calls.push(["rpc", name, args]);
    return pulseEnv.ensure();
  },
};
businessDateModule.getBusinessNow = async () => new Date("2026-11-01T11:00:00Z");
buildingModule.getFixedBuildingIdentity = () => ({ id: "building-1", name: "Building One" });
systemModule.createSystemClient = () => ensureClient;
serverClientModule.createClient = async () => ensureClient;
progressionModule.loadGiulianaPackageProgression = async ({ startMonth }) => {
  pulseEnv.calls.push(["progression", startMonth]);
  return {
    data: {
      activePackage: { obligationMonth: "2026-10", mode: "live", status: "collecting_readings" },
      mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
      pendingReviews: [],
    },
    error: null,
    requestCount: 1,
  };
};
snapshotModule.createMonthlyObligationHandoff = async ({ obligationMonth, operatingMonth }) => {
  pulseEnv.calls.push(["handoff", obligationMonth, operatingMonth]);
  return { data: null, error: "Sedapal water bill has not been entered yet.", failureKind: "not_ready" };
};

function stubPulseEnvironment({ ensure }) {
  pulseEnv.calls = [];
  pulseEnv.ensure = ensure;
  return pulseEnv;
}

test("system Pulse ensures the operational month before evaluating progression", async () => {
  const env = stubPulseEnvironment({
    ensure: () => ({ data: { billingPeriodId: "period-nov", month: "2026-11", created: true }, error: null }),
  });
  const result = await pulseModule.runMonthlyObligationPulse("system");
  assert.deepEqual(env.calls.map((call) => call[0]), ["rpc", "progression", "handoff"]);
  assert.deepEqual(env.calls[0], ["rpc", "tb810_ensure_operational_billing_period_system", { p_building_id: "building-1" }]);
  // Calendar = November; the oldest unfinished package (October) is still the candidate.
  assert.deepEqual(env.calls[1], ["progression", "2026-11"]);
  assert.deepEqual(env.calls[2], ["handoff", "2026-10", "2026-11"]);
  assert.equal(result.status, "not_ready");
  assert.equal(result.obligationMonth, "2026-10");
  assert.deepEqual(result.operationalMonth, { status: "ensured", month: "2026-11", billingPeriodId: "period-nov", created: true });
});

test("an ensure error is reported and does not gate progression", async () => {
  for (const ensure of [
    () => ({ data: null, error: { message: "permission denied for function" } }),
    () => { throw new Error("network down"); },
    () => ({ data: null, error: null }),
  ]) {
    const env = stubPulseEnvironment({ ensure });
    const result = await pulseModule.runMonthlyObligationPulse("system");
    assert.deepEqual(env.calls.map((call) => call[0]), ["rpc", "progression", "handoff"]);
    assert.equal(result.status, "not_ready");
    assert.equal(result.operationalMonth.status, "error");
    assert.ok(result.operationalMonth.reason);
  }
});

test("DEV/human Pulse semantics are unchanged: no ensure call, no operationalMonth field", async () => {
  const env = stubPulseEnvironment({ ensure: () => assert.fail("human Pulse must not ensure") });
  const result = await pulseModule.runMonthlyObligationPulse("human", async () => ({ data: null, error: null }));
  assert.deepEqual(env.calls.map((call) => call[0]), ["progression", "handoff"]);
  assert.equal("operationalMonth" in result, false);
});

test("a collecting_readings container is a live, unfinished package everywhere", () => {
  const ensured = { obligationMonth: "2026-10", mode: "live", status: "collecting_readings" };
  assert.equal(isHandedOffPackage(ensured), false);
  assert.equal(selectFinancialFocus(ensured), "current");
  // Calendar November, November container exists, October unfinished: October stays active.
  assert.equal(selectGiulianaWorkspaceMonth({ activePackage: ensured, mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" } }), "2026-10");

  // Gas: the October pool stays open (selection, not reservation).
  const bills = [
    { id: "selected-oct", processed_at: null, reserved_billing_period_id: null, selected_obligation_month: "2026-10-01" },
    { id: "selected-nov", processed_at: null, reserved_billing_period_id: null, selected_obligation_month: "2026-11-01" },
  ];
  const lifecycle = { billingPeriodId: "period-oct", billingPeriodStatus: "collecting_readings", gasReservationState: null };
  assert.deepEqual(selectGasBillsForLifecycle(bills, lifecycle, "2026-10").map((bill) => bill.id), ["selected-oct"]);

  // Water and Sedapal sources stay editable: only finalized consuming packages freeze them.
  assert.equal(isSourceMonthEditable({ sourceMonth: "2026-10", activeMonth: "2026-11", consumingPackage: { status: "collecting_readings" } }), true);
  assert.equal(isSourceMonthEditable({ sourceMonth: "2026-11", activeMonth: "2026-11", consumingPackage: null }), true);
  assert.equal(isCommonWaterBillEditable({ consuming_package_status: "collecting_readings" }), true);
});

test("facts lifecycle and Carlos's queue ignore collecting_readings rows", () => {
  const facts = fs.readFileSync("supabase/migrations/20261004120000_gas_bill_pool_reservation.sql", "utf8");
  const factsBody = facts.slice(facts.indexOf("create or replace function public.tb810_get_building_month_financial_facts("));
  for (const cte of ["current_lifecycle", "upcoming_lifecycle"]) {
    const start = factsBody.indexOf(`${cte} as (`);
    assert.notEqual(start, -1, cte);
    assert.match(factsBody.slice(start, factsBody.indexOf("limit 1", start)), /bp\.status in \('ready_for_review', 'approved', 'invoices_generated', 'closed'\)/, cte);
  }
  const progression = fs.readFileSync("supabase/migrations/20261009130000_progression_unfinished_package_anchor.sql", "utf8");
  assert.match(progression, /where bp\.building_id = p_building_id\s+and bp\.status = 'ready_for_review'/);
  assert.doesNotMatch(progression, /'collecting_readings'/);
});

test("handoff still creates or reuses the row and accepts collecting_readings", () => {
  const handoff = fs.readFileSync("supabase/migrations/20261008120000_gas_production_contract.sql", "utf8");
  const start = handoff.indexOf("create or replace function public.tb810_mark_monthly_obligation_ready_for_review_internal(");
  const internal = handoff.slice(start, handoff.indexOf("$$;", start));
  assert.match(internal, /'collecting_readings'\)\s*on conflict \(building_id, period_year, period_month\) do nothing;/);
  assert.match(internal, /if v_period\.status not in \('draft', 'collecting_readings'\) then/);
  assert.match(internal, /update public\.tb810_billing_periods set status = 'ready_for_review' where id = v_period\.id;/);
});
