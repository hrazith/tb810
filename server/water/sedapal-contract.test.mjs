import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createJiti from "jiti";

// Static structure checks for the Sedapal source-freeze migration. These do
// not execute PostgreSQL; the runtime scenarios are registered as todo below
// and remain unproven until run against a real database.
const migrationPath = "supabase/migrations/20261006120000_sedapal_source_freeze_contract.sql";
const migration = fs.readFileSync(migrationPath, "utf8");
const k6Handoff = fs.readFileSync("supabase/migrations/20261004120000_gas_bill_pool_reservation.sql", "utf8");
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$`));
  assert.ok(match, `${name} is defined`);
  return match[1];
}

function indexOf(body, pattern, label) {
  const index = body.search(pattern);
  assert.ok(index >= 0, `missing ${label}`);
  return index;
}

test("only the shared source-freeze extraction follows the Sedapal contract", () => {
  const migrations = fs.readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  const later = migrations.slice(migrations.indexOf("20261006120000_sedapal_source_freeze_contract.sql") + 1);
  assert.deepEqual(later, ["20261007120000_unit_water_start_over_source_freeze.sql"]);

  // That migration may re-point the Sedapal source lock at the shared helper,
  // and must not redefine any other Sedapal contract function.
  const extraction = fs.readFileSync(`supabase/migrations/${later[0]}`, "utf8");
  const redefined = [...extraction.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]).sort();
  assert.deepEqual(redefined, [
    "tb810_clear_current_unit_water_month",
    "tb810_lock_common_water_source_periods",
    "tb810_lock_source_month_open",
    "tb810_sync_meter_reading_import",
  ]);

  const sedapalLock = functionBody(extraction, "tb810_lock_common_water_source_periods");
  assert.match(sedapalLock, /order by source_month[\s\S]*perform public\.tb810_lock_source_month_open\(p_building_id, v_source\.source_month, 'Sedapal source'\)/);
  assert.match(sedapalLock, /Common water bills must remain attached to a source Billing Period\./);
  assert.match(sedapalLock, /Common water source Billing Period was not found for this building\./);

  const shared = functionBody(extraction, "tb810_lock_source_month_open");
  const sharedLock = indexOf(shared, /pg_advisory_xact_lock_shared\(public\.tb810_monthly_obligation_package_lock_key/, "shared package lock");
  const statusRead = indexOf(shared, /select bp\.status into v_status/, "status read");
  assert.ok(sharedLock < statusRead, "status is read only after the lock");
  assert.match(shared, /v_status in \('approved', 'invoices_generated', 'closed'\)/);
  assert.doesNotMatch(shared, /'ready_for_review'/);
});

test("package lock key is identical to the K6 handoff advisory key", () => {
  assert.match(k6Handoff, /pg_advisory_xact_lock\(hashtextextended\(format\('%s:%s:%s', p_building_id, p_period_year, p_period_month\), 0\)\)/);
  assert.match(
    functionBody(migration, "tb810_monthly_obligation_package_lock_key"),
    /hashtextextended\(format\('%s:%s:%s', p_building_id, p_period_year, p_period_month\), 0\)/,
  );
});

test("source-open helper locks ascending and reads status only after all locks", () => {
  const body = functionBody(migration, "tb810_lock_common_water_source_periods");
  const firstOrder = indexOf(body, /order by consuming\.consuming_month/, "ascending order");
  const sharedLock = indexOf(body, /pg_advisory_xact_lock_shared\(public\.tb810_monthly_obligation_package_lock_key/, "shared package lock");
  const statusRead = indexOf(body, /select bp\.status into v_status/, "status read");
  assert.ok(firstOrder < sharedLock && sharedLock < statusRead);
  assert.match(body, /v_status in \('approved', 'invoices_generated', 'closed'\)/);
  assert.doesNotMatch(body, /'ready_for_review'/);
  assert.match(body, /must remain attached to a source Billing Period/);
});

test("Common Water INSERT and UPDATE protect source and destination consuming packages", () => {
  const body = functionBody(migration, "tb810_sync_common_water_utility_bill");
  assert.match(body, /tb810_lock_common_water_source_periods\(new\.building_id, array\[new\.billing_period_id\]\)/);
  assert.match(body, /array_remove\(array\[old\.billing_period_id, new\.billing_period_id\], null\)/);
  for (const message of ["Building is read-only", "Utility type is read-only", "Previous reading is read-only"]) {
    assert.match(body, new RegExp(message));
  }
  assert.match(body, /if new\.billing_period_id is null then/);
  assert.match(body, /Reading date must belong to the source Billing Period month/);
  assert.match(body, /new\.total_consumption := new\.current_reading - old\.previous_reading;/);
  assert.match(body, /new\.unit_cost := round\(new\.amount \/ new\.total_consumption, 4\);/);
  assert.match(migration, /create trigger tb810_utility_bills_sync_common_water\s+before insert or update on public\.tb810_utility_bills/);
});

test("source writes lock the billing-period row before package advisory locks", () => {
  const body = functionBody(migration, "tb810_sync_common_water_utility_bill");
  const [insertBranch, updateBranch] = body.split("-- Non-Common Water utility bills keep their existing immutable behaviour.");
  for (const [label, branch] of [["INSERT", insertBranch], ["UPDATE", updateBranch]]) {
    const rowLock = indexOf(branch, /for key share;/, `${label} row lock`);
    const packageLocks = indexOf(branch, /tb810_lock_common_water_source_periods/, `${label} package locks`);
    assert.ok(rowLock < packageLocks, `${label} must lock the row before advisory locks`);
  }
});

test("DELETE protection is restored and the DEV reset path respects the freeze", () => {
  assert.match(migration, /create trigger tb810_utility_bills_block_delete\s+before delete on public\.tb810_utility_bills\s+for each row execute function public\.tb810_block_common_water_bill_changes\(\)/);
  const body = functionBody(migration, "tb810_block_common_water_bill_changes");
  const devPath = indexOf(body, /tb810\.dev_common_water_reset_bill_id/, "DEV reset GUC");
  const freeze = indexOf(body, /tb810_lock_common_water_source_periods/, "freeze check");
  const allow = indexOf(body, /return old;/, "DEV delete");
  assert.ok(devPath < freeze && freeze < allow);
  assert.match(body, /raise exception 'Common water bills are immutable'/);
});

test("persistence locks the package and asserts Sedapal provenance before rows or Gas", () => {
  const body = functionBody(migration, "tb810_persist_monthly_obligation_snapshot");
  const rowLock = indexOf(body, /for update;/, "row lock");
  const packageLock = indexOf(body, /pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key/, "exclusive package lock");
  const provenance = indexOf(body, /tb810_assert_sedapal_provenance/, "provenance assertion");
  const insert = indexOf(body, /insert into public\.tb810_monthly_financial_obligations/, "row insert");
  const gas = indexOf(body, /tb810_assert_gas_bill_reservation/, "Gas consumption");
  assert.ok(rowLock < packageLock && packageLock < provenance && provenance < insert && insert < gas);
});

test("provenance assertion fails closed for missing, ambiguous, absent and changed facts", () => {
  const body = functionBody(migration, "tb810_assert_sedapal_provenance");
  assert.match(body, /Sedapal source bill is missing/);
  assert.match(body, /Sedapal source is ambiguous/);
  assert.match(body, /Sedapal provenance is missing/);
  assert.match(body, /Sedapal source changed after review/);
  for (const field of ["id", "billingPeriodId", "amount", "previousReading", "currentReading", "totalConsumption"]) {
    assert.match(body, new RegExp(`'${field}'`));
  }
  assert.match(body, /obligation_type' in \('common_water', 'water_consumption'\)/);
});

test("both approval RPCs take the exclusive package lock after the row lock", () => {
  for (const name of ["tb810_approve_monthly_obligation", "tb810_approve_dev_monthly_obligation"]) {
    const body = functionBody(migration, name);
    const rowLock = indexOf(body, /period_month = p_period_month\s+for update;/, `${name} row lock`);
    const packageLock = indexOf(body, /pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key\(v_period\.building_id/, `${name} package lock`);
    const approved = indexOf(body, /set status = 'approved'/, `${name} approval`);
    assert.ok(rowLock < packageLock && packageLock < approved);
  }
});

test("the existing-rows approval branch must prove provenance before approving", () => {
  const body = functionBody(migration, "tb810_approve_monthly_obligation");
  const branch = indexOf(body, /-- Previously persisted rows must prove the same Sedapal provenance\./, "existing-rows branch");
  const assertion = body.indexOf("tb810_assert_sedapal_provenance", branch);
  const approved = body.indexOf("set status = 'approved'", branch);
  assert.ok(assertion > branch && assertion < approved);
});

test("internal helpers are not executable by application roles", () => {
  for (const signature of [
    "tb810_monthly_obligation_package_lock_key(uuid, integer, integer)",
    "tb810_lock_common_water_source_periods(uuid, uuid[])",
    "tb810_assert_sedapal_provenance(uuid, integer, integer, jsonb)",
  ]) {
    assert.ok(migration.includes(`revoke all on function public.${signature} from public, anon, authenticated;`), signature);
  }
});

test("the application maps exactly the database stale-provenance message", () => {
  const { mapApprovalRpcError } = jiti("@/server/obligations/approval.ts");
  const raised = migration.match(/raise exception '(Sedapal source changed after review)[^']*'/);
  assert.ok(raised);
  assert.equal(
    mapApprovalRpcError(`${raised[1]} for the 2026-10 Monthly Obligations package.`),
    "The Monthly Obligations package changed. Review it again before approving.",
  );
});

test("catalog verifier accepts the migrated contract and detects the live drift classes", async () => {
  const { verifyCatalog } = await import("../../scripts/verify-sedapal-contract.mjs");
  const triggers = [
    ["tb810_utility_bills_set_updated_at", "CREATE TRIGGER tb810_utility_bills_set_updated_at BEFORE UPDATE ON public.tb810_utility_bills FOR EACH ROW EXECUTE FUNCTION tb810_set_updated_at()"],
    ["tb810_utility_bills_sync_common_water", "CREATE TRIGGER tb810_utility_bills_sync_common_water BEFORE INSERT OR UPDATE ON public.tb810_utility_bills FOR EACH ROW EXECUTE FUNCTION tb810_sync_common_water_utility_bill()"],
    ["tb810_utility_bills_block_delete", "CREATE TRIGGER tb810_utility_bills_block_delete BEFORE DELETE ON public.tb810_utility_bills FOR EACH ROW EXECUTE FUNCTION tb810_block_common_water_bill_changes()"],
  ].map(([name, detail]) => ({ kind: "trigger", name, detail }));
  const functions = [
    "tb810_monthly_obligation_package_lock_key",
    "tb810_lock_common_water_source_periods",
    "tb810_assert_sedapal_provenance",
    "tb810_sync_common_water_utility_bill",
    "tb810_block_common_water_bill_changes",
    "tb810_persist_monthly_obligation_snapshot",
    "tb810_approve_monthly_obligation",
    "tb810_approve_dev_monthly_obligation",
  ].map((name) => ({ kind: "function", name, detail: functionBody(migration, name) }));

  assert.deepEqual(verifyCatalog([...triggers, ...functions]), []);

  const withoutDeleteTrigger = verifyCatalog([...triggers.filter((row) => row.name !== "tb810_utility_bills_block_delete"), ...functions]);
  assert.ok(withoutDeleteTrigger.includes("missing trigger tb810_utility_bills_block_delete"));

  const driftedLiveSync = "\nbegin\n  if tg_op = 'INSERT' then\n    return new;\n  end if;\n\n  raise exception 'Common water bills are immutable';\nend;\n";
  const drifted = verifyCatalog([...triggers, ...functions.map((row) => (
    row.name === "tb810_sync_common_water_utility_bill" ? { ...row, detail: driftedLiveSync } : row
  ))]);
  assert.ok(drifted.some((failure) => failure.startsWith("function tb810_sync_common_water_utility_bill drifted")));
});

// PostgreSQL runtime proof. Deferred: TB810 has no approved database test
// environment for executing these against PostgreSQL.
const deferred = "Deferred: requires PostgreSQL runtime execution; not proven.";
test.todo(`A. September Sedapal correction 2026-09-16 -> 2026-09-05, 3100.00 -> 2760.50 keeps 12146 -> 12846, 700, unit cost 3.9436. ${deferred}`);
test.todo(`B. Freeze matrix: consuming package absent/ready_for_review editable; approved/invoices_generated/closed rejected. ${deferred}`);
test.todo(`C. INSERT under a frozen consuming package is rejected. ${deferred}`);
test.todo(`D. DELETE cannot bypass the freeze, including the DEV reset GUC path. ${deferred}`);
test.todo(`E. Source-period moves are rejected when either original or destination consuming package is frozen. ${deferred}`);
test.todo(`F. Missing or ambiguous Common Water source fails approval closed. ${deferred}`);
test.todo(`G. Approval payload without Sedapal provenance fails closed. ${deferred}`);
test.todo(`H. Provenance mismatch leaves no obligation rows, no processed Gas bills, and no approval. ${deferred}`);
test.todo(`I. Two-connection races: approval-wins edit fails; in-flight edit-wins approval rejects; committed edit before approval transaction rejects. ${deferred}`);
test.todo(`J. Existing-rows approval branch cannot approve without matching provenance. ${deferred}`);
