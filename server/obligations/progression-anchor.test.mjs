import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createJiti from "jiti";

// The node suite cannot execute SQL. These tests pin the migration text and
// prove that every TypeScript consumer follows a progression whose active
// package is earlier than the operating month. The SQL behavior itself was
// verified against a disposable local Postgres with all migrations applied.

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const migration = fs.readFileSync("supabase/migrations/20261009130000_progression_unfinished_package_anchor.sql", "utf8");
const body = migration.slice(migration.indexOf("as $$"), migration.lastIndexOf("$$;"));

const { selectGiulianaWorkspaceMonth } = jiti("./package-selection.ts");
const { isHandoffCalendarEligible } = jiti("./snapshot.ts");
const { selectDashboardPackageMonth } = jiti("../dashboard.ts");
const { chargeEditWindowFromProgression, isChargeMonthEditable } = jiti("../charges/index.ts");
const { isSourceMonthEditable, primaryUnitWaterSourceMonth, unitWaterMonthNote } = jiti("../water/source-editability.ts");

// October never handed off; the calendar has reached November.
const lateOctober = {
  activePackage: { obligationMonth: "2026-10", mode: "live", status: null },
  mostRecentHandoff: { obligationMonth: "2026-09", status: "approved" },
  pendingReviews: [],
};

test("anchor is least(operating month, month after the latest handed-off period)", () => {
  assert.match(body, /with recursive anchor as \(\s*select least\(\s*p_start_year \* 12 \+ \(p_start_month - 1\),\s*coalesce\(/);
  assert.match(body, /select max\(bp\.period_year \* 12 \+ \(bp\.period_month - 1\)\) \+ 1\s+from public\.tb810_billing_periods bp\s+where bp\.building_id = p_building_id\s+and bp\.status in \('ready_for_review', 'approved', 'invoices_generated', 'closed'\)/);
  // Bootstrap: with no handed-off period the operating month is the anchor.
  assert.match(body, /\),\s*p_start_year \* 12 \+ \(p_start_month - 1\)\s*\)\s*\) as month_ordinal/);
  assert.match(body, /from anchor\s+left join public\.tb810_billing_periods bp/);
});

test("month ordinals are zero-based so the walk crosses November, December and year ends", () => {
  assert.match(body, /bp\.period_year = anchor\.month_ordinal \/ 12\s+and bp\.period_month = anchor\.month_ordinal % 12 \+ 1/);
  assert.match(body, /bp\.period_year = \(progression\.month_ordinal \+ 1\) \/ 12\s+and bp\.period_month = \(progression\.month_ordinal \+ 1\) % 12 \+ 1/);
  assert.match(body, /\(bp\.period_year \* 12 \+ \(bp\.period_month - 1\)\) < active\.month_ordinal/);
  assert.match(body, /format\('%s-%s', active\.month_ordinal \/ 12, lpad\(\(active\.month_ordinal % 12 \+ 1\)::text, 2, '0'\)\)/);
  // The one-based encoding resolved the month after November to month 0.
  assert.doesNotMatch(body, /p_start_year \* 12 \+ p_start_month\b/);
  assert.doesNotMatch(body, /\(progression\.month_ordinal \+ 1\) % 12\s+(?!\+)/);

  // Mirror of the SQL arithmetic.
  const ordinal = (month) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const label = (value) => `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
  assert.deepEqual(
    ["2026-11", "2026-12", "2027-01"].map((month) => label(ordinal(month) + 1)),
    ["2026-12", "2027-01", "2027-02"],
  );
});

test("contract, payload and Carlos review queue are unchanged; no new lifecycle state", () => {
  assert.match(migration, /create or replace function public\.tb810_get_giuliana_package_progression\(\s*p_building_id uuid,\s*p_start_year integer,\s*p_start_month integer\s*\)\s*returns jsonb/);
  for (const key of ["'activePackage'", "'mostRecentHandoff'", "'pendingReviews'", "'chronologicallyActionable'", "'approvalEligible'"]) {
    assert.ok(body.includes(key), key);
  }
  assert.match(body, /'mode', 'live'/);
  assert.doesNotMatch(migration, /alter table|create table|add column|insert into|update public/i);
});

test("restated ACL keeps anon closed and service_role open for Pulse", () => {
  assert.match(migration, /revoke all on function public\.tb810_get_giuliana_package_progression\(uuid, integer, integer\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.tb810_get_giuliana_package_progression\(uuid, integer, integer\) to authenticated, service_role;/);
});

test("every caller still passes the operating month, which now bounds the anchor", () => {
  const callers = [
    ["server/obligations/pulse.ts", /loadGiulianaPackageProgression\(\{ buildingId: building\.id, startMonth: obligationMonth/],
    ["server/dashboard.ts", /loadGiulianaPackageProgression\(\{\s*buildingId: building\.id,\s*startMonth: operatingMonth/],
    ["app/(staff)/obligations/page.tsx", /loadGiulianaPackageProgression\(\{\s*buildingId: TB810_BUILDING_ID,\s*startMonth: operatingMonth/],
    ["server/charges/index.ts", /loadGiulianaPackageProgression\(\{ buildingId, startMonth: await currentMonthKey\(\)/],
    ["server/gas/index.ts", /loadGiulianaPackageProgression\(\{ buildingId, startMonth: operatingMonth/],
    ["server/water/unit-meter-readings.ts", /loadGiulianaPackageProgression\(\{ buildingId: buildingResult\.data\.id, startMonth: operatingMonth/],
  ];
  for (const [file, pattern] of callers) assert.match(fs.readFileSync(file, "utf8"), pattern, file);
});

test("Pulse can hand off a late package and still never hands off early", () => {
  assert.equal(isHandoffCalendarEligible("2026-10", "2026-11"), true);
  assert.equal(isHandoffCalendarEligible("2026-12", "2027-01"), true);
  assert.equal(isHandoffCalendarEligible("2026-12", "2026-11"), false);
  // Pulse hands off the progression candidate, not the operating month.
  assert.match(fs.readFileSync("server/obligations/pulse.ts", "utf8"), /obligationMonth: candidate\.obligationMonth, operatingMonth: obligationMonth/);
});

test("dashboard and Obligations workspace stay on the late package", () => {
  assert.equal(selectGiulianaWorkspaceMonth(lateOctober), "2026-10");
  assert.equal(selectDashboardPackageMonth({ audience: "giuliana", ...lateOctober }), "2026-10");
  assert.equal(selectDashboardPackageMonth({ audience: "carlos", ...lateOctober }), "2026-10");
});

test("after the late handoff the successor becomes the workspace while Carlos reviews", () => {
  const afterLateHandoff = {
    activePackage: { obligationMonth: "2026-11", mode: "live", status: null },
    mostRecentHandoff: { obligationMonth: "2026-10", status: "ready_for_review" },
    pendingReviews: [{ billingPeriodId: "oct", obligationMonth: "2026-10", status: "ready_for_review", outstanding: true, chronologicallyActionable: true, approvalEligible: true }],
  };
  assert.equal(selectGiulianaWorkspaceMonth(afterLateHandoff), "2026-10");
  assert.equal(selectDashboardPackageMonth({ audience: "carlos", ...afterLateHandoff }), "2026-10");
  assert.equal(selectDashboardPackageMonth({ audience: "giuliana", ...afterLateHandoff }), "2026-11");
  const window = chargeEditWindowFromProgression(afterLateHandoff);
  assert.equal(isChargeMonthEditable("2026-11", window, false), true);
  assert.equal(isChargeMonthEditable("2026-10", window, true), true);
  assert.equal(isChargeMonthEditable("2026-10", window, false), false);
});

test("Unit Charges for a late package remain editable; approved months do not", () => {
  const window = chargeEditWindowFromProgression(lateOctober);
  for (const isUnitTarget of [true, false]) {
    assert.equal(isChargeMonthEditable("2026-10", window, isUnitTarget), true);
    assert.equal(isChargeMonthEditable("2026-11", window, isUnitTarget), true);
    assert.equal(isChargeMonthEditable("2026-09", window, isUnitTarget), false);
  }
});

test("Gas supplier pool follows the late package", () => {
  const gas = fs.readFileSync("server/gas/index.ts", "utf8");
  const start = gas.indexOf("async function getOpenGasPoolMonth");
  assert.notEqual(start, -1);
  assert.match(gas.slice(start, gas.indexOf("\n}\n", start)), /return \{ data: progression\.data\.activePackage\.obligationMonth, error: null \}/);
});

test("Unit Water keeps the late package's source month as current work", () => {
  const primary = primaryUnitWaterSourceMonth({ activeObligationMonth: "2026-10", operatingMonth: "2026-11" });
  assert.equal(primary, "2026-09");
  assert.equal(unitWaterMonthNote({ month: "2026-09", primaryMonth: primary, sourceMonthOpen: true }), "Current work");
  assert.equal(unitWaterMonthNote({ month: "2026-10", primaryMonth: primary, sourceMonthOpen: true }), "Next source work");
  assert.equal(isSourceMonthEditable({ sourceMonth: "2026-09", activeMonth: "2026-11", consumingPackage: null }), true);
  assert.equal(isSourceMonthEditable({ sourceMonth: "2026-08", activeMonth: "2026-11", consumingPackage: { status: "approved" } }), false);
});
