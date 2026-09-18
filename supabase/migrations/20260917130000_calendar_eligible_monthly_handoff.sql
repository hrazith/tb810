-- A package may be financially ready before its obligation month begins, but
-- handoff is only valid once the canonical operating month reaches it.
create or replace function public.tb810_mark_monthly_obligation_ready_for_review_internal(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_operating_year integer,
  p_operating_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.tb810_billing_periods%rowtype;
  v_row_count integer;
begin
  if make_date(p_period_year, p_period_month, 1) > make_date(p_operating_year, p_operating_month, 1) then
    raise exception 'Billing Period is not eligible for handoff before its obligation month.';
  end if;

  insert into public.tb810_billing_periods (
    building_id, period_year, period_month, starts_on, ends_on, status
  ) values (
    p_building_id,
    p_period_year,
    p_period_month,
    make_date(p_period_year, p_period_month, 1),
    (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date,
    'collecting_readings'
  ) on conflict (building_id, period_year, period_month) do nothing;

  select * into v_period
  from public.tb810_billing_periods
  where building_id = p_building_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;

  if v_period.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    select count(*) into v_row_count
    from public.tb810_monthly_financial_obligations
    where billing_period_id = v_period.id;
    return jsonb_build_object(
      'billingPeriodId', v_period.id,
      'status', 'already_progressed',
      'obligationRowCount', v_row_count
    );
  end if;

  if v_period.status not in ('draft', 'collecting_readings') then
    raise exception 'Billing Period cannot be handed off from status %.', v_period.status;
  end if;

  update public.tb810_billing_periods
  set status = 'ready_for_review'
  where id = v_period.id;

  return jsonb_build_object(
    'billingPeriodId', v_period.id,
    'status', 'ready_for_review',
    'obligationRowCount', 0
  );
end;
$$;

create or replace function public.tb810_mark_monthly_obligation_ready_for_review(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_operating_year integer,
  p_operating_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'Staff role cannot hand off Monthly Obligations.';
  end if;
  return public.tb810_mark_monthly_obligation_ready_for_review_internal(
    p_building_id,
    p_period_year,
    p_period_month,
    p_operating_year,
    p_operating_month
  );
end;
$$;

create or replace function public.tb810_mark_monthly_obligation_ready_for_review_system(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_operating_year integer,
  p_operating_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'System execution requires the Supabase service role.';
  end if;
  return public.tb810_mark_monthly_obligation_ready_for_review_internal(
    p_building_id,
    p_period_year,
    p_period_month,
    p_operating_year,
    p_operating_month
  );
end;
$$;

revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_internal(uuid, integer, integer) from public;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_internal(uuid, integer, integer, integer, integer) from public;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer) from public, anon, service_role;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer) to authenticated;
grant execute on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer, integer, integer) to service_role;
