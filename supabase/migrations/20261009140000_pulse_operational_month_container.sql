-- FIN-008 (Dual-Clock Monthly Operating Model): the operational/source clock
-- follows the calendar. Pulse establishes the current operational month's
-- Billing Period container independently of obligation handoff, so source
-- facts keyed to that month (for example the Sedapal bill emitted in it) can be
-- entered while an earlier obligation package is still unfinished.
--
-- The month comes from the database UTC clock; callers cannot choose it.
-- The insert is inert: 'collecting_readings' is the status every existing
-- creation path uses for a period that has not been handed off. Progression,
-- the facts read, Gas selection, source freezes and Carlos's queue all treat it
-- like an absent row. An existing row is never updated, so lifecycle state,
-- Gas reservation, approval and source facts are untouched. The handoff later
-- finds the row and moves it to ready_for_review as before.
create or replace function public.tb810_ensure_operational_billing_period_system(
  p_building_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', timezone('utc', now()))::date;
  v_period_id uuid;
  v_created boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'System execution requires the Supabase service role.';
  end if;

  insert into public.tb810_billing_periods (building_id, period_year, period_month, starts_on, ends_on, status)
  values (
    p_building_id,
    extract(year from v_month)::integer,
    extract(month from v_month)::integer,
    v_month,
    (v_month + interval '1 month - 1 day')::date,
    'collecting_readings'
  )
  on conflict (building_id, period_year, period_month) do nothing
  returning id into v_period_id;

  if v_period_id is not null then
    v_created := true;
  else
    select bp.id into v_period_id
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from v_month)::integer
      and bp.period_month = extract(month from v_month)::integer;
  end if;

  return jsonb_build_object(
    'billingPeriodId', v_period_id,
    'month', to_char(v_month, 'YYYY-MM'),
    'created', v_created
  );
end;
$$;

revoke all on function public.tb810_ensure_operational_billing_period_system(uuid)
  from public, anon, authenticated;
grant execute on function public.tb810_ensure_operational_billing_period_system(uuid) to service_role;
