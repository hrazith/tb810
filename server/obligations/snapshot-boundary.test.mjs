import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20260917120000_snapshot_at_approval.sql", import.meta.url), "utf8");
const calendarMigration = readFileSync(new URL("../../supabase/migrations/20260917130000_calendar_eligible_monthly_handoff.sql", import.meta.url), "utf8");
const aclMigration = readFileSync(new URL("../../supabase/migrations/20260917133000_restrict_monthly_handoff_internal_acl.sql", import.meta.url), "utf8");
const devHandoffMigration = readFileSync(new URL("../../supabase/migrations/20260917140000_dev_monthly_handoff_ownership.sql", import.meta.url), "utf8");
const pulse = readFileSync(new URL("./pulse.ts", import.meta.url), "utf8");

test("new DEV approvals reuse canonical persistence and journal ownership in one RPC", () => {
  const wrapperStart = migration.indexOf("create or replace function public.tb810_approve_dev_monthly_obligation");
  const wrapper = migration.slice(wrapperStart, migration.indexOf("create or replace function public.tb810_prepare_dev_monthly_obligation_reset", wrapperStart));
  assert.match(wrapper, /tb810_persist_monthly_obligation_snapshot/);
  assert.match(wrapper, /insert into public\.tb810_dev_test_mutations/);
  assert.match(wrapper, /set status = 'approved'/);
  assert.ok(wrapper.indexOf("tb810_persist_monthly_obligation_snapshot") < wrapper.indexOf("insert into public.tb810_dev_test_mutations"));
  assert.ok(wrapper.indexOf("insert into public.tb810_dev_test_mutations") < wrapper.indexOf("set status = 'approved'"));
});

test("pulse no longer invokes snapshot persistence", () => {
  assert.match(pulse, /createMonthlyObligationHandoff/);
  assert.doesNotMatch(pulse, /createMonthlyObligationSnapshot/);
});

test("progressed periods without rows fail the facts read as an integrity error", () => {
  assert.match(migration, /tb810_assert_monthly_obligation_snapshot_integrity/);
  assert.match(migration, /status in \('approved', 'invoices_generated', 'closed'\)/);
  assert.match(migration, /Billing Period is finalized without persisted obligations/);
  assert.match(migration, /from integrity_check/);
});

test("handoff SQL enforces the operating-month boundary", () => {
  assert.match(calendarMigration, /p_operating_year integer/);
  assert.match(calendarMigration, /p_operating_month integer/);
  assert.match(calendarMigration, /make_date\(p_period_year, p_period_month, 1\) > make_date\(p_operating_year, p_operating_month, 1\)/);
  assert.match(calendarMigration, /not eligible for handoff/);
  assert.match(calendarMigration, /grant execute on function public\.tb810_mark_monthly_obligation_ready_for_review\(uuid, integer, integer, integer, integer\) to authenticated/);
  assert.match(calendarMigration, /grant execute on function public\.tb810_mark_monthly_obligation_ready_for_review_system\(uuid, integer, integer, integer, integer\) to service_role/);
  assert.match(calendarMigration, /revoke all on function public\.tb810_mark_monthly_obligation_ready_for_review\(uuid, integer, integer\) from public, anon, authenticated, service_role/);
  assert.match(calendarMigration, /revoke all on function public\.tb810_mark_monthly_obligation_ready_for_review_system\(uuid, integer, integer\) from public, anon, authenticated, service_role/);
});

test("internal handoff helpers are not directly executable by application roles", () => {
  assert.match(aclMigration, /tb810_mark_monthly_obligation_ready_for_review_internal\(uuid, integer, integer\) from public, anon, authenticated, service_role/);
  assert.match(aclMigration, /tb810_mark_monthly_obligation_ready_for_review_internal\(uuid, integer, integer, integer, integer\) from public, anon, authenticated, service_role/);
  assert.match(calendarMigration, /grant execute on function public\.tb810_mark_monthly_obligation_ready_for_review\(uuid, integer, integer, integer, integer\) to authenticated/);
  assert.match(calendarMigration, /grant execute on function public\.tb810_mark_monthly_obligation_ready_for_review_system\(uuid, integer, integer, integer, integer\) to service_role/);
});

test("DEV handoff ownership is transactional and uses the existing obligations journal", () => {
  assert.match(devHandoffMigration, /create or replace function public\.tb810_mark_dev_monthly_obligation_ready_for_review/);
  assert.match(devHandoffMigration, /tb810_mark_monthly_obligation_ready_for_review_internal/);
  assert.match(devHandoffMigration, /pg_advisory_xact_lock/);
  assert.match(devHandoffMigration, /for update/);
  assert.match(devHandoffMigration, /'obligations'::public\.tb810_dev_test_domain/);
  assert.match(devHandoffMigration, /'monthly_handoff'/);
  assert.match(devHandoffMigration, /v_period_before/);
  assert.match(devHandoffMigration, /insert into public\.tb810_dev_test_mutations/);
  assert.ok(devHandoffMigration.indexOf("tb810_mark_monthly_obligation_ready_for_review_internal") < devHandoffMigration.indexOf("insert into public.tb810_dev_test_mutations"));
  assert.match(devHandoffMigration, /revoke all on function public\.tb810_mark_dev_monthly_obligation_ready_for_review\(uuid, uuid, integer, integer, integer, integer\) from public, anon, service_role/);
  assert.match(devHandoffMigration, /grant execute on function public\.tb810_mark_dev_monthly_obligation_ready_for_review\(uuid, uuid, integer, integer, integer, integer\) to authenticated/);
});

test("DEV reset composes handoff ownership before and after approval", () => {
  assert.match(devHandoffMigration, /record_type = 'monthly_handoff'/);
  assert.match(devHandoffMigration, /operation in \('create', 'update'\)/);
  assert.match(devHandoffMigration, /DEV handoff Billing Period has unowned obligation rows/);
  assert.match(devHandoffMigration, /DEV-owned Billing Period changed before handoff reset/);
  assert.match(devHandoffMigration, /not exists \(\s*select 1 from public\.tb810_monthly_financial_obligations/);
});
