import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import createJiti from "jiti";

// Database behaviour (permission, diff, reason, atomicity, append-only) was
// executed against a disposable PostgreSQL loaded with the live schema. These
// tests pin the migration structure, the application wiring and the pure
// formatting/error mapping.
const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(process.cwd()) } });
const { describeUnitChange, formatUnitChangeValue } = jiti("./change-history.ts");
const { UNIT_AUTHORIZATION_ERROR, userFacingUnitWriteError } = jiti("./errors.ts");
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20261008130000_unit_change_events.sql");
const authorization = read("./authorization.ts");
const service = read("./index.ts");
const actions = read("../../app/(staff)/units/actions.ts");
const detailPage = read("../../app/(staff)/units/[unitNumber]/page.tsx");
const editPage = read("../../app/(staff)/units/[unitNumber]/edit/page.tsx");
const newPage = read("../../app/(staff)/units/new/page.tsx");
const unitForm = read("../../app/(staff)/units/_components/unit-form.tsx");
const unitsControls = read("../../app/(staff)/units/_components/units-controls.tsx");

function sqlFunction(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  return migration.slice(start, migration.indexOf("\n$$;", start) + 4);
}

function position(body, pattern, label) {
  const index = body.search(pattern);
  assert.ok(index >= 0, `missing ${label}`);
  return index;
}

test("unit change events are append-only, staff-readable and not client-writable", () => {
  assert.match(migration, /create table public\.tb810_unit_change_events/);
  assert.match(migration, /unit_id uuid not null references public\.tb810_units\(id\) on delete restrict/);
  assert.match(migration, /reason text not null check \(btrim\(reason\) <> ''\)/);
  assert.match(migration, /changes jsonb not null check \(jsonb_typeof\(changes\) = 'array' and jsonb_array_length\(changes\) > 0\)/);
  assert.match(migration, /for select using \(public\.is_tb810_staff\(\)\)/);
  assert.doesNotMatch(migration, /on public\.tb810_unit_change_events\s+for (insert|update|delete|all)/);
  assert.match(migration, /revoke all on table public\.tb810_unit_change_events from public, anon, authenticated;/);
  assert.match(migration, /before update or delete on public\.tb810_unit_change_events/);
  assert.match(migration, /before truncate on public\.tb810_unit_change_events/);
  assert.match(migration, /Unit change history is append-only\./);
  assert.doesNotMatch(migration, /tb810_audit_logs/);
});

test("tb810_update_unit authorizes, locks, diffs server-side and writes Unit + event together", () => {
  const fn = sqlFunction("tb810_update_unit");
  const authorize = position(fn, /has_tb810_permission\('units\.manage'\)/, "permission check");
  const lock = position(fn, /from public\.tb810_units where id = p_unit_id for update/, "row lock");
  const unchanged = position(fn, /'status', 'unchanged'/, "unchanged return");
  const reasonCheck = position(fn, /A reason for change is required\./, "reason check");
  const update = position(fn, /update public\.tb810_units/, "Unit update");
  const event = position(fn, /insert into public\.tb810_unit_change_events/, "event insert");
  assert.ok(authorize < lock && lock < unchanged && unchanged < reasonCheck && reasonCheck < update && update < event);
  assert.match(fn, /security definer/);
  assert.match(fn, /You are not authorized to manage Units\./);
  assert.match(fn, /v_has_meter := v_new_type_code = 'condo'/);
  assert.match(fn, /v_has_gas_service := v_new_type_code = 'condo'/);
  // Actor identity comes from auth.uid(), never from parameters.
  assert.doesNotMatch(fn, /p_actor/);
  assert.match(fn, /v_unit\.building_id, v_unit\.id, auth\.uid\(\), v_actor\.id, v_actor\.display_name, v_reason, v_changes/);
  for (const field of ["unit_type", "unit_number", "floor", "registered_area_m2", "participation_percentage", "has_meter", "has_gas_service", "notes"]) {
    assert.match(fn, new RegExp(`'field', '${field}'`), `${field} is tracked`);
  }
  for (const untracked of ["updated_at", "created_at", "building_id', ", "legacy_", "display_order"]) {
    assert.doesNotMatch(fn, new RegExp(`'field', '${untracked}`), `${untracked} is not tracked`);
  }
  assert.match(migration, /revoke all on function public\.tb810_update_unit\([^)]*\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.tb810_update_unit\([^)]*\) to authenticated, service_role;/);
});

test("authorization refusals map to one clear operator message", () => {
  const map = userFacingUnitWriteError;
  assert.equal(UNIT_AUTHORIZATION_ERROR, "You are not authorized to manage Units.");
  assert.equal(map("Cannot coerce the result to a single JSON object"), "You are not authorized to manage Units.");
  assert.equal(map('new row violates row-level security policy for table "tb810_units"'), "You are not authorized to manage Units.");
  assert.equal(map("permission denied for function tb810_update_unit"), "You are not authorized to manage Units.");
  assert.equal(map("You are not authorized to manage Units."), "You are not authorized to manage Units.");
  assert.equal(map("A reason for change is required."), "A reason for change is required.");
  assert.equal(map('duplicate key value violates unique constraint "tb810_units_building_id_unit_number_key"'), "Unit number already exists.");
  assert.match(authorization, /rpc\("has_tb810_permission", \{ permission_key: "units\.manage" \}\)/);
});

test("Edit, Add and the edit/new routes are offered only with units.manage", () => {
  assert.match(detailPage, /canManageUnits\(\)/);
  assert.match(detailPage, /\{canEdit \? \(\s*<div className="flex flex-wrap gap-3">\s*<Link\s*href=\{`\/units\/\$\{unit\.unit_number\}\/edit`\}/);
  assert.ok(position(editPage, /if \(!\(await canManageUnits\(\)\)\) \{\s*redirect\(`\/units\//, "edit guard") < position(editPage, /getUnitByNumberForCurrentBuilding\(unitNumber\)/, "lookup"));
  assert.ok(position(newPage, /if \(!\(await canManageUnits\(\)\)\) \{\s*redirect\("\/units"\)/, "new guard") < position(newPage, /getUnitFormDefaults\(\)/, "defaults"));
  assert.match(unitsControls, /\{canManageUnits \? \(\s*<Button asChild variant="primary" shape="pill">\s*<Link href="\/units\/new">Add Unit<\/Link>/);
  // Server actions do not rely on UI hiding.
  assert.equal([...actions.matchAll(/if \(!\(await canManageUnits\(\)\)\) return toFormStateError\(UNIT_AUTHORIZATION_ERROR, values\);/g)].length, 2);
  assert.match(service, /if \(!\(await canManageUnits\(\)\)\) return \{ data: null as never, error: UNIT_AUTHORIZATION_ERROR \};/);
});

test("Unit edits go through the transactional function with a reason", () => {
  const update = service.slice(service.indexOf("export async function updateUnit("), service.indexOf("export async function listUnitChangeEvents("));
  assert.match(update, /rpc\("tb810_update_unit"/);
  assert.doesNotMatch(update, /from\("tb810_units"\)/);
  assert.doesNotMatch(update, /\.single\(\)/);
  assert.match(actions, /fieldErrors: \{ reason: UNIT_REASON_REQUIRED_ERROR \}/);
  assert.match(editPage, /showReasonForChange/);
  assert.doesNotMatch(newPage, /showReasonForChange/);
  assert.match(unitForm, /Reason for change/);
  assert.match(unitForm, /Explain why this Unit information is changing\./);
  assert.match(unitForm, /name="reason"/);
});

test("history and legacy notes are presented for what they are", () => {
  assert.match(detailPage, /Change history/);
  assert.match(detailPage, /No changes recorded\./);
  assert.match(detailPage, /Legacy notes \(imported\)/);
  assert.match(unitForm, /Legacy notes \(imported\)/);
  assert.doesNotMatch(detailPage, />Notes</);
  assert.match(service, /\.from\("tb810_unit_change_events"\)[\s\S]*?\.order\("created_at", \{ ascending: false \}\)/);
});

test("change entries render operator labels and readable values", () => {
  assert.deepEqual(describeUnitChange({ field: "has_gas_service", before: true, after: false }), { label: "Gas service", before: "Yes", after: "No" });
  assert.deepEqual(describeUnitChange({ field: "has_meter", before: true, after: false }), { label: "Individual water meter", before: "Yes", after: "No" });
  assert.deepEqual(describeUnitChange({ field: "unit_type", before: "condo", after: "parking" }), { label: "Type", before: "Residential", after: "Parking" });
  assert.deepEqual(describeUnitChange({ field: "participation_percentage", before: 1.556, after: 1.6 }), { label: "Participation percentage", before: "1.556%", after: "1.6%" });
  assert.deepEqual(describeUnitChange({ field: "registered_area_m2", before: null, after: 92.125 }), { label: "Registered area", before: "—", after: "92.125 m²" });
  assert.deepEqual(describeUnitChange({ field: "notes", before: "Bono empleados 05/2026", after: null }), { label: "Legacy notes (imported)", before: "Bono empleados 05/2026", after: "—" });
  assert.equal(formatUnitChangeValue("floor", ""), "—");
});
