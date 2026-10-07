import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const originalMigration = read("../../supabase/migrations/20260925120000_clear_current_unit_water_month.sql");
const freezeMigration = read("../../supabase/migrations/20261007120000_unit_water_start_over_source_freeze.sql");
const action = read("../../app/(staff)/water/unit-meter-readings/actions.ts");
const service = read("./unit-meter-readings.ts");
const workspace = read("../../app/(staff)/water/unit-meter-readings/_components/upload-completed-template-button.tsx");

// Assertions are scoped to the function they describe, so a symbol elsewhere in
// the same file cannot satisfy them by accident.
function tsFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `unterminated ${signature}`);
  return source.slice(start, end + 2);
}

function sqlFunction(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return source.slice(start, end + 4);
}

const clearRpc = sqlFunction(freezeMigration, "tb810_clear_current_unit_water_month");
const freezeHelper = sqlFunction(freezeMigration, "tb810_lock_source_month_open");
const sedapalLock = sqlFunction(freezeMigration, "tb810_lock_common_water_source_periods");
const clearService = tsFunction(service, "export async function clearCurrentUnitWaterMonth(");
const clearAction = tsFunction(action, "export async function clearCurrentUnitWaterMonthAction(");
const uploadControl = tsFunction(workspace, "export function UploadCompletedTemplateButton(");

test("the original Start Over was calendar-locked; the freeze migration supersedes that gate", () => {
  assert.match(sqlFunction(originalMigration, "tb810_clear_current_unit_water_month"), /p_month_key <> to_char\(current_date, 'YYYY-MM'\)/);
  assert.doesNotMatch(clearRpc, /to_char\(current_date, 'YYYY-MM'\)/, "no calendar-equality gate");
  assert.match(clearRpc, /v_month_start > date_trunc\('month', current_date\)::date[\s\S]*Future Unit Water months cannot be started over/, "the future stays closed");
});

test("Start Over asserts the canonical source freeze under the K6 package lock before deleting", () => {
  const freeze = clearRpc.indexOf("perform public.tb810_lock_source_month_open(v_building_id, v_month_start, 'Unit Water month')");
  const select = clearRpc.indexOf("into v_reading_ids, v_reading_count");
  const del = clearRpc.indexOf("delete from public.tb810_meter_readings");
  assert.ok(freeze > 0 && freeze < select && select < del, "freeze is asserted before the month is read and deleted");
  assert.match(clearRpc, /reading_month = v_month_start/);
  assert.match(clearRpc, /delete from public\.tb810_meter_readings\s+where id = any\(v_reading_ids\)/, "one set-based atomic delete");
});

test("the freeze helper is the single financial invariant shared with Sedapal", () => {
  const lock = freezeHelper.indexOf("pg_advisory_xact_lock_shared(public.tb810_monthly_obligation_package_lock_key(");
  const status = freezeHelper.indexOf("select bp.status into v_status");
  assert.ok(lock > 0 && lock < status, "status is read only after the shared K6 lock is held");
  assert.match(freezeHelper, /interval '1 month'/, "consuming package is S+1");
  assert.match(freezeHelper, /v_status in \('approved', 'invoices_generated', 'closed'\)/, "canonical finalized statuses");
  assert.match(freezeHelper, /This % is locked because the % Monthly Obligations package is %\./);
  assert.match(sedapalLock, /perform public\.tb810_lock_source_month_open\(p_building_id, v_source\.source_month, 'Sedapal source'\)/, "Sedapal delegates to the same helper");
  assert.doesNotMatch(sedapalLock, /approved/, "Sedapal no longer carries its own copy of the freeze statuses");
  assert.match(freezeMigration, /revoke all on function public\.tb810_lock_source_month_open\(uuid, date, text\) from public, anon, authenticated;/);
});

test("Start over preserves authorization and DEV ownership boundaries", () => {
  assert.match(clearRpc, /has_tb810_role\('building_manager'\) or public\.has_tb810_role\('super_admin'\)/);
  assert.match(clearRpc, /status = 'active'/);
  assert.match(clearRpc, /mutation\.domain = 'water'/);
  assert.match(clearRpc, /mutation\.record_type = 'meter_reading'/);
  assert.match(clearRpc, /mutation\.operation = 'create'/);
  assert.match(clearRpc, /v_owned_count <> v_reading_count/);
  assert.match(clearRpc, /delete from public\.tb810_dev_test_mutations/);
  assert.match(freezeMigration, /revoke all on function public\.tb810_clear_current_unit_water_month\(text, uuid\) from public, anon, service_role;/);
  assert.match(freezeMigration, /grant execute on function public\.tb810_clear_current_unit_water_month\(text, uuid\) to authenticated;/);
});

test("the app gates Start Over on canonical source editability, not the calendar", () => {
  assert.match(clearService, /canEditSourceMonth\(monthKey, await getBusinessNow\(\)\)/);
  assert.match(clearService, /if \(!editability\.allowed\)/);
  assert.match(clearService, /\.rpc\("tb810_clear_current_unit_water_month"/);
  assert.doesNotMatch(clearService, /getActiveReadingMonth|getOperatingReadingMonth|new Date\(\)/, "no calendar month in the gate");
});

test("Start over does not use the per-row delete action", () => {
  assert.match(clearAction, /clearCurrentUnitWaterMonth\(monthKey\)/);
  assert.match(clearAction, /revalidatePath\(`\/water\/unit-meter-readings\/\$\{monthKey\}`\)/);
  assert.doesNotMatch(clearAction, /deleteUnitMeterReading\(/);
});

test("a complete intake month offers Start over in place of Upload", () => {
  assert.match(uploadControl, /const currentMonthComplete = currentReadingCount === expectedReadingCount;/);
  assert.match(uploadControl, /\{currentMonthComplete \? \(\s*<StartOverButton/);
  assert.doesNotMatch(uploadControl, /startOverAvailable/, "no separate calendar availability flag");
});
