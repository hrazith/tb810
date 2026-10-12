import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd()) } });
const { gasSourceMonthForObligationMonth, gasObligationMonthForSourceMonth } = jiti("./month-utils.ts");
const { calculateGasCharges } = jiti("./calculation.ts");
const { buildGasCalculationInputFromFacts } = jiti("../obligations/owner-facts.ts");

const read = (relative) => readFileSync(relative, "utf8");
const ALIGNMENT = "supabase/migrations/20261012130000_gas_source_month_alignment.sql";
const RESTATEMENT = "supabase/migrations/20261012140000_gas_obligation_restatement.sql";
const CONTRACT = "supabase/migrations/20261008120000_gas_production_contract.sql";
const FACTS = "supabase/migrations/20261004120000_gas_bill_pool_reservation.sql";

function definition(file, name) {
  const source = read(file);
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${file} defines ${name}`);
  return source.slice(start, source.indexOf("\n$$;", start) + 4);
}

const alignment = read(ALIGNMENT);
const restatement = read(RESTATEMENT);

test("Gas usage of month M is billed in M+1: package M consumes Gas reading month M", () => {
  assert.equal(gasSourceMonthForObligationMonth("2026-10"), "2026-10");
  assert.equal(gasObligationMonthForSourceMonth("2026-10"), "2026-10");
  assert.equal(gasSourceMonthForObligationMonth("2027-01"), "2027-01");
});

test("the historical importer stores each Legacy reading under the month it was taken", () => {
  // Legacy Lecturas columns hold readings taken on the 1st: column AB is
  // 2026-07-01 and AC is 2026-08-01. Legacy "Consumo Julio" (AC - AB) is July
  // usage, billed in August; "Consumo Junio" (AB - AA) is June usage, billed in
  // July. The importer files AC under 2026-08 and AB under 2026-07, so the
  // package that bills each usage month consumes the reading month equal to it.
  const importer = read("scripts/import-historical-gas-readings.js");
  const startMonth = importer.match(/const START_MONTH = "(\d{4}-\d{2})"/)[1];
  const firstIndex = Number(importer.match(/const FIRST_MONTH_INDEX = (\d+)/)[1]);
  const monthForColumnIndex = (index) => {
    const date = new Date(`${startMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index - firstIndex);
    return date.toISOString().slice(0, 7);
  };
  const columnIndex = (letters) => [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  for (const [closingColumn, legacyBilledMonth] of [["AB", "2026-07"], ["AC", "2026-08"]]) {
    assert.equal(monthForColumnIndex(columnIndex(closingColumn)), gasSourceMonthForObligationMonth(legacyBilledMonth), closingColumn);
  }
});

test("October bills September usage: the October 1 readings price the September purchases", () => {
  // Package 2026-10 consumes the readings filed in 2026-10 (taken October 1).
  const facts = {
    obligationMonth: "2026-10",
    sourceReadingMonth: "2026-09",
    gasSourceMonth: gasSourceMonthForObligationMonth("2026-10"),
    gasBills: [1, 2, 3, 4].map((index) => ({ id: `bill-${index}`, amount: "460.00", processed_at: null })),
    obligationLifecycle: { mode: "live", billingPeriodId: null, billingPeriodStatus: null, gasReservationState: null },
    unitRows: [
      { id: "unit-503", unit_number: "503", unit_type_code: "condo", has_gas_service: true },
      { id: "unit-504", unit_number: "504", unit_type_code: "condo", has_gas_service: true },
      { id: "unit-e01", unit_number: "E-01", unit_type_code: "parking", has_gas_service: false },
    ],
    gasReadings: [
      { id: "reading-503", unit_id: "unit-503", reading_month: "2026-10-01", consumption: 0.137 },
      { id: "reading-504", unit_id: "unit-504", reading_month: "2026-10-01", consumption: 143.556 },
    ],
  };
  const input = buildGasCalculationInputFromFacts(facts, "2026-10");
  assert.equal(input.sourceReadingMonth, "2026-10");
  const result = calculateGasCharges(input);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.gasCostPool, "1840.00");
  assert.equal(result.totalConsumption, "143.693");
  assert.equal(result.blendedRate, "12.805077");
  assert.equal(result.unitCharges.find((charge) => charge.unitId === "unit-503").amount, "1.75");
});

test("a missing reading for an enrolled Gas Unit still blocks the package", () => {
  const result = calculateGasCharges({
    sourceReadingMonth: "2026-10",
    obligationMonth: "2026-10",
    supplierBills: [{ billId: "bill-1", amount: "460.00", status: "unprocessed" }],
    units: [
      { unitId: "unit-503", unitNumber: "503", unitTypeCode: "condo", hasGasService: true, consumption: "0.137" },
      { unitId: "unit-306", unitNumber: "306", unitTypeCode: "condo", hasGasService: true, consumption: null },
    ],
  });
  assert.deepEqual(result.blockers, ["Required gas readings are missing."]);
  assert.deepEqual(result.missingUnits.map((unit) => unit.unitNumber), ["306"]);
});

test("application reads use the Gas source month for Gas and keep Water on the previous month", () => {
  const ownerFacts = read("server/obligations/owner-facts.ts");
  assert.match(ownerFacts, /gasSourceMonth: gasSourceMonthForObligationMonth\(obligationMonth\)/);
  assert.match(ownerFacts, /gasSourceMonth: gasSourceMonthForObligationMonth\(upcomingMonth\)/);
  assert.match(ownerFacts, /sourceReadingMonth: financialFacts\.gasSourceMonth,/);
  assert.match(read("server/obligations/snapshot.ts"), /gasProvenanceForUnit\(facts\.gasSourceMonth, reading, gasPoolProvenance\)/);
  assert.match(read("server/obligations/summary-facts.ts"), /sourceReadingMonth: financialFacts\.gasSourceMonth,/);
  assert.match(read("server/dashboard.ts"), /gasSourceMonthForObligationMonth\(facts\.obligations\.obligationMonth\)/);
  const provider = read("server/gas/provider.ts");
  assert.doesNotMatch(provider, /previousMonthKeyFromMonthKey/);
  assert.equal(provider.match(/gasSourceMonthForObligationMonth\(obligationMonth\)/g).length, 2);
});

test("the alignment migration changes only the Gas source-month mapping", () => {
  const defined = [...alignment.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]);
  assert.deepEqual(defined, [
    "tb810_lock_gas_source_month_open",
    "tb810_guard_gas_reading_source_freeze",
    "tb810_sync_gas_reading_import",
    "tb810_clear_current_gas_reading_month_dev",
    "tb810_assert_gas_provenance",
    "tb810_get_building_month_financial_facts",
  ]);

  const swapLock = (source, month) => source.replace(
    `perform public.tb810_lock_source_month_open(v_building_id, ${month}, 'Gas source month');`,
    `perform public.tb810_lock_gas_source_month_open(v_building_id, ${month});`,
  );
  const freezeComment = (source) => source
    .replace("-- Canonical source freeze, serialized against handoff/approval of S+1.", "-- Gas source freeze, serialized against handoff/approval of package S.");

  assert.equal(
    definition(ALIGNMENT, "tb810_guard_gas_reading_source_freeze"),
    swapLock(definition(CONTRACT, "tb810_guard_gas_reading_source_freeze"), "v_month"),
  );
  assert.equal(
    definition(ALIGNMENT, "tb810_sync_gas_reading_import"),
    freezeComment(swapLock(definition(CONTRACT, "tb810_sync_gas_reading_import"), "v_month_start")),
  );
  // The DEV Start Over is the renamed two-argument function from the contract.
  assert.equal(
    definition(ALIGNMENT, "tb810_clear_current_gas_reading_month_dev"),
    freezeComment(swapLock(definition(CONTRACT, "tb810_clear_current_gas_reading_month"), "v_month_start"))
      .replace("create or replace function public.tb810_clear_current_gas_reading_month(", "create or replace function public.tb810_clear_current_gas_reading_month_dev("),
  );
  assert.equal(
    definition(ALIGNMENT, "tb810_assert_gas_provenance"),
    definition(CONTRACT, "tb810_assert_gas_provenance").replace(
      "v_source_month date := (make_date(p_period_year, p_period_month, 1) - interval '1 month')::date;",
      "v_source_month date := make_date(p_period_year, p_period_month, 1);",
    ),
  );
  assert.equal(
    definition(ALIGNMENT, "tb810_get_building_month_financial_facts"),
    definition(FACTS, "tb810_get_building_month_financial_facts")
      .replace(
        "gr.reading_month = (select upcoming_reading_month from reading_months)\n",
        "gr.reading_month = ((select upcoming_reading_month from reading_months) + interval '1 month')::date\n",
      )
      .replace(
        "gr.reading_month = (select current_reading_month from reading_months)",
        "gr.reading_month = (select upcoming_reading_month from reading_months)",
      ),
  );
});

test("Gas reading month S is frozen by package S through the shared source lock", () => {
  const helper = definition(ALIGNMENT, "tb810_lock_gas_source_month_open");
  assert.match(helper, /perform public\.tb810_lock_source_month_open\(\s*p_building_id,\s*\(date_trunc\('month', p_reading_month\) - interval '1 month'\)::date,\s*'Gas source month'\s*\);/);
  assert.match(alignment, /revoke all on function public\.tb810_lock_gas_source_month_open\(uuid, date\)\s+from public, anon, authenticated, service_role;/);
  for (const name of ["tb810_guard_gas_reading_source_freeze", "tb810_sync_gas_reading_import", "tb810_clear_current_gas_reading_month_dev"]) {
    const body = definition(ALIGNMENT, name);
    assert.match(body, /tb810_lock_gas_source_month_open\(/, name);
    assert.doesNotMatch(body, /tb810_lock_source_month_open\(/, name);
  }
});

test("restatement is a system-only, dry-run-first, Gas-only repair of an approved package", () => {
  const fn = definition(RESTATEMENT, "tb810_restate_gas_obligations_system");
  assert.match(fn, /p_dry_run boolean default true/);
  assert.match(fn, /if auth\.role\(\) is distinct from 'service_role' then/);
  assert.match(fn, /if v_period\.status <> 'approved' then/);
  assert.match(fn, /where r->>'obligation_type' is distinct from 'gas_consumption'/);
  assert.match(fn, /already use the % Gas source month; nothing to restate/);
  assert.match(fn, /for update;\s+if not found then\s+raise exception 'Billing Period not found\.';\s+end if;\s+perform pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key/);
  assert.match(fn, /and b\.reserved_billing_period_id = v_period\.id;/);
  assert.match(fn, /Required gas readings are missing: % enrolled Unit\(s\) have no % reading\./);
  assert.match(fn, /exactly one row for every enrolled Gas Unit/);
  assert.match(fn, /perform public\.tb810_assert_gas_provenance\(p_building_id, p_period_year, p_period_month, p_rows, v_bill_ids\);/);
  assert.match(fn, /abs\(v_new_total - v_pool\) > 0\.005 \* v_row_count/);
  assert.ok(fn.indexOf("if p_dry_run then") < fn.indexOf("delete from public.tb810_monthly_financial_obligations"), "dry run returns before any write");
  assert.match(fn, /delete from public\.tb810_monthly_financial_obligations\s+where billing_period_id = v_period\.id\s+and obligation_type = 'gas_consumption';/);
  assert.equal((fn.match(/\bdelete from\b/g) ?? []).length, 1);
  assert.doesNotMatch(fn, /\bupdate public\./, "no other table or row is updated");
  assert.match(fn, /insert into public\.tb810_audit_logs/);
  assert.match(fn, /perform public\.tb810_assert_monthly_obligation_snapshot_integrity\(/);
  assert.match(restatement, /revoke all on function public\.tb810_restate_gas_obligations_system\(uuid, integer, integer, jsonb, text, boolean\)\s+from public, anon, authenticated;/);
  assert.match(restatement, /grant execute on function public\.tb810_restate_gas_obligations_system\(uuid, integer, integer, jsonb, text, boolean\)\s+to service_role;/);
});

test("the restatement script calculates with the application and writes only when confirmed", () => {
  const script = read("scripts/restate-gas-obligations.mjs");
  assert.match(script, /const args = \{ month: null, reason: null, write: false, confirmTarget: null \};/);
  assert.match(script, /if \(args\.write && args\.confirmTarget !== target\)/);
  assert.match(script, /getSnapshotCalculation\(/);
  assert.match(script, /filter\(\(row\) => row\.obligation_type === "gas_consumption"\)/);
  assert.match(script, /p_dry_run: !args\.write,/);
  const code = script.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /calculateGasCharges|blendedRate\s*=|1840|143\.693/, "no independent formula or legacy totals");
});
