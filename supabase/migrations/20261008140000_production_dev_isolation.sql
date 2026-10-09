-- Production application roles must have no authority over DEV state.
--
-- Preserve the DEV tables, journals, and helpers for forensic history and
-- disposable/local database use, but make them inaccessible through the
-- production PostgREST roles. Mixed production/DEV RPCs are split into an
-- exact public production signature and an owner-only DEV implementation.

-- Supabase's current public-schema defaults grant new functions to every API
-- role. Close that inheritance path for postgres, the owner of every TB810
-- function and the role migrations run as. Production RPCs are granted
-- explicitly below. supabase_admin's defaults are out of reach (postgres is not
-- a member of it) and it owns only extension functions in this schema.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- No API role may read, create, alter, or journal DEV sessions. Existing rows
-- remain intact. With RLS enabled and no policies, access is denied even if a
-- table grant is added accidentally later.
revoke all on table public.tb810_dev_test_sessions
  from public, anon, authenticated, service_role;
revoke all on table public.tb810_dev_test_mutations
  from public, anon, authenticated, service_role;

drop policy if exists "tb810 staff can read dev test sessions"
  on public.tb810_dev_test_sessions;
drop policy if exists "tb810 staff can manage dev test sessions"
  on public.tb810_dev_test_sessions;
drop policy if exists "tb810 staff can read dev test mutations"
  on public.tb810_dev_test_mutations;
drop policy if exists "tb810 staff can manage dev test mutations"
  on public.tb810_dev_test_mutations;

-- Split the three mixed RPCs. Renaming preserves the complete, already-live
-- authorization, locking, immutability, and lifecycle implementation without
-- copying it. The original names are recreated with exact production-only
-- signatures, so PostgREST never has to resolve defaulted overloads.
alter function public.tb810_clear_current_unit_water_month(text, uuid)
  rename to tb810_clear_current_unit_water_month_dev;
alter function public.tb810_clear_current_gas_reading_month(text, uuid)
  rename to tb810_clear_current_gas_reading_month_dev;
alter function public.tb810_create_bulk_charge(text, text, numeric, text, text, text, uuid)
  rename to tb810_create_bulk_charge_dev;

revoke all on function public.tb810_clear_current_unit_water_month_dev(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_clear_current_gas_reading_month_dev(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_create_bulk_charge_dev(text, text, numeric, text, text, text, uuid)
  from public, anon, authenticated, service_role;

create function public.tb810_clear_current_unit_water_month(p_month_key text)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.tb810_clear_current_unit_water_month_dev(p_month_key, null::uuid);
$$;

create function public.tb810_clear_current_gas_reading_month(p_month_key text)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.tb810_clear_current_gas_reading_month_dev(p_month_key, null::uuid);
$$;

create function public.tb810_create_bulk_charge(
  p_target_kind text,
  p_description text,
  p_amount numeric,
  p_schedule text,
  p_starts_month text,
  p_ends_month text default null
)
returns table (
  series_id uuid,
  inserted_count integer,
  total_amount numeric
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.tb810_create_bulk_charge_dev(
    p_target_kind,
    p_description,
    p_amount,
    p_schedule,
    p_starts_month,
    p_ends_month,
    null::uuid
  );
$$;

revoke all on function public.tb810_clear_current_unit_water_month(text)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_clear_current_gas_reading_month(text)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_create_bulk_charge(text, text, numeric, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.tb810_clear_current_unit_water_month(text) to authenticated;
grant execute on function public.tb810_clear_current_gas_reading_month(text) to authenticated;
grant execute on function public.tb810_create_bulk_charge(text, text, numeric, text, text, text) to authenticated;

-- DEV-only RPCs and reset helpers are owner-only. Revoke every API role,
-- including PUBLIC and service_role; revoking authenticated alone is not a
-- boundary because role privileges are additive.
revoke all on function public.tb810_approve_dev_monthly_obligation(uuid, uuid, integer, integer, jsonb, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_create_dev_common_water_bill_with_document(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, numeric, numeric, text, text, text, text, bigint, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_create_dev_monthly_obligation_snapshot(uuid, uuid, integer, integer, jsonb, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_mark_dev_monthly_obligation_ready_for_review(uuid, uuid, integer, integer, integer, integer, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_prepare_dev_monthly_obligation_reset(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_reset_dev_test_session(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_reset_dev_test_session_base(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_sync_dev_gas_reading_import(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_sync_dev_meter_reading_import(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
