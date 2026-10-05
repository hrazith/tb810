alter table public.tb810_gas_bills
  add column if not exists reserved_billing_period_id uuid;

alter table public.tb810_billing_periods
  add column if not exists gas_reservation_state text;

alter table public.tb810_billing_periods
  add constraint tb810_billing_periods_building_id_id_key unique (building_id, id);

alter table public.tb810_gas_bills
  add constraint tb810_gas_bills_reserved_period_same_building_fk
  foreign key (building_id, reserved_billing_period_id)
  references public.tb810_billing_periods (building_id, id)
  on delete restrict;

alter table public.tb810_billing_periods
  add constraint tb810_billing_periods_gas_reservation_state_check
  check (gas_reservation_state is null or gas_reservation_state in ('native_reserved', 'native_empty'));

create or replace function public.tb810_require_gas_reservation_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'ready_for_review' and new.status in ('collecting_readings', 'approved')
     and old.gas_reservation_state is null then
    raise exception 'This Billing Period requires Gas reservation reconciliation before approval.';
  end if;
  return new;
end;
$$;

drop trigger if exists tb810_require_gas_reservation_on_approval on public.tb810_billing_periods;
create trigger tb810_require_gas_reservation_on_approval
before update of status on public.tb810_billing_periods
for each row execute function public.tb810_require_gas_reservation_on_approval();

create index if not exists tb810_gas_bills_reserved_period_idx
  on public.tb810_gas_bills(reserved_billing_period_id);

create index if not exists tb810_gas_bills_reserved_building_period_idx
  on public.tb810_gas_bills(building_id, reserved_billing_period_id);

-- These fields are written by the canonical lifecycle functions, not by direct
-- authenticated table mutations.
revoke insert (reserved_billing_period_id), update (reserved_billing_period_id)
  on public.tb810_gas_bills from authenticated, anon, public;
revoke insert (gas_reservation_state), update (gas_reservation_state)
  on public.tb810_billing_periods from authenticated, anon, public;

drop function if exists public.tb810_mark_dev_monthly_obligation_ready_for_review(uuid, uuid, integer, integer, integer, integer);
drop function if exists public.tb810_mark_dev_monthly_obligation_ready_for_review(uuid, uuid, integer, integer, integer, integer, uuid[]);
drop function if exists public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer);
drop function if exists public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer, uuid[]);
drop function if exists public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer, integer, integer);
drop function if exists public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer, integer, integer, uuid[]);
drop function if exists public.tb810_mark_monthly_obligation_ready_for_review_internal(uuid, integer, integer, integer, integer);

create or replace function public.tb810_mark_monthly_obligation_ready_for_review_internal(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_operating_year integer,
  p_operating_month integer,
  p_gas_bill_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.tb810_billing_periods%rowtype;
  v_row_count integer;
  v_available_bill_ids uuid[] := '{}';
  v_requested_bill_ids uuid[] := '{}';
  v_requested_count integer := 0;
begin
  if make_date(p_period_year, p_period_month, 1) > make_date(p_operating_year, p_operating_month, 1) then
    raise exception 'Billing Period is not eligible for handoff before its obligation month.';
  end if;

  insert into public.tb810_billing_periods (building_id, period_year, period_month, starts_on, ends_on, status)
  values (p_building_id, p_period_year, p_period_month, make_date(p_period_year, p_period_month, 1),
    (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date, 'collecting_readings')
  on conflict (building_id, period_year, period_month) do nothing;

  select * into v_period from public.tb810_billing_periods
  where building_id = p_building_id and period_year = p_period_year and period_month = p_period_month
  for update;

  if v_period.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    select count(*) into v_row_count from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id;
    return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'already_progressed', 'obligationRowCount', v_row_count);
  end if;
  if v_period.status not in ('draft', 'collecting_readings') then
    raise exception 'Billing Period cannot be handed off from status %.', v_period.status;
  end if;

  if p_gas_bill_ids is not null and exists (
    select 1 from unnest(p_gas_bill_ids) requested(id) where requested.id is null
  ) then
    raise exception 'Gas bill reservation cannot contain NULL IDs.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(format('%s:%s:%s', p_building_id, p_period_year, p_period_month), 0));
  select coalesce(array_agg(available.id order by available.id), '{}')
    into v_available_bill_ids
  from (
    select id
    from public.tb810_gas_bills
    where building_id = p_building_id and processed_at is null and reserved_billing_period_id is null
    order by id
    for update
  ) available;

  select coalesce(array_agg(requested.id order by requested.id), '{}'), count(*)
    into v_requested_bill_ids, v_requested_count
  from unnest(coalesce(p_gas_bill_ids, '{}')) as requested(id);
  if v_requested_count <> cardinality(coalesce(p_gas_bill_ids, '{}')) then
    raise exception 'Gas bill reservation contains duplicate IDs.';
  end if;
  if v_requested_bill_ids <> v_available_bill_ids then
    raise exception 'Gas bill set changed before handoff; review the package again.';
  end if;

  if cardinality(v_requested_bill_ids) > 0 then
    update public.tb810_gas_bills
    set reserved_billing_period_id = v_period.id
    where building_id = p_building_id and id = any(v_requested_bill_ids);
  end if;
  update public.tb810_billing_periods
  set gas_reservation_state = case when cardinality(v_requested_bill_ids) = 0 then 'native_empty' else 'native_reserved' end
  where id = v_period.id;

  update public.tb810_billing_periods set status = 'ready_for_review' where id = v_period.id;
  return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'ready_for_review', 'obligationRowCount', 0);
end;
$$;

create or replace function public.tb810_assert_gas_bill_reservation(
  p_billing_period_id uuid,
  p_building_id uuid,
  p_gas_bill_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
  v_reserved_count integer;
  v_requested_count integer;
begin
  select gas_reservation_state into v_state
  from public.tb810_billing_periods
  where id = p_billing_period_id and building_id = p_building_id
  for update;
  if not found then raise exception 'Billing Period reservation provenance is unavailable.'; end if;
  if p_gas_bill_ids is not null and exists (
    select 1 from unnest(p_gas_bill_ids) requested(id) where requested.id is null
  ) then
    raise exception 'Gas bill approval set cannot contain NULL IDs.';
  end if;
  if v_state is null then
    raise exception 'This Billing Period requires Gas reservation reconciliation before approval.';
  end if;
  select count(*) into v_requested_count from unnest(coalesce(p_gas_bill_ids, '{}'));
  if v_requested_count <> cardinality(coalesce(p_gas_bill_ids, '{}')) then
    raise exception 'Gas bill approval set contains duplicate IDs.';
  end if;
  select count(*) into v_reserved_count
  from public.tb810_gas_bills
  where building_id = p_building_id and reserved_billing_period_id = p_billing_period_id;
  if v_state = 'native_empty' then
    if v_requested_count <> 0 or v_reserved_count <> 0 then
      raise exception 'Gas approval set does not match the empty reserved pool.';
    end if;
    return;
  end if;
  if v_state <> 'native_reserved' or v_requested_count <> v_reserved_count then
    raise exception 'Gas approval set does not match the Billing Period reservation.';
  end if;
  if exists (
    select 1 from public.tb810_gas_bills
    where building_id = p_building_id
      and reserved_billing_period_id = p_billing_period_id
      and processed_at is not null
  ) then
    raise exception 'A reserved Gas bill was already processed.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_gas_bill_ids, '{}')) requested(id)
    left join public.tb810_gas_bills bill
      on bill.id = requested.id
     and bill.building_id = p_building_id
     and bill.reserved_billing_period_id = p_billing_period_id
    where bill.id is null
  ) then
    raise exception 'Gas approval set contains a bill not reserved to this Billing Period.';
  end if;
end;
$$;

create or replace function public.tb810_persist_monthly_obligation_snapshot(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
  p_gas_bill_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.tb810_billing_periods%rowtype;
  v_row_count integer;
  v_inserted_count integer;
begin
  if p_period_month < 1 or p_period_month > 12 then raise exception 'Invalid Billing Period month.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'A complete Monthly Obligation snapshot must contain rows.'; end if;
  insert into public.tb810_billing_periods (building_id, period_year, period_month, starts_on, ends_on, status)
  values (p_building_id, p_period_year, p_period_month, make_date(p_period_year, p_period_month, 1), (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date, 'collecting_readings')
  on conflict (building_id, period_year, period_month) do nothing;
  select * into v_period from public.tb810_billing_periods
  where building_id = p_building_id and period_year = p_period_year and period_month = p_period_month
  for update;
  if v_period.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    select count(*) into v_row_count from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id;
    if v_row_count = 0 then raise exception 'Billing Period is marked snapshotted without persisted obligations.'; end if;
    return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'already_snapshotted', 'obligationRowCount', v_row_count);
  end if;
  if v_period.status not in ('draft', 'collecting_readings') then raise exception 'Billing Period cannot be snapshotted from status %.', v_period.status; end if;

  insert into public.tb810_monthly_financial_obligations (
    building_id, unit_id, unit_account_id, billing_period_id, obligation_type, source_service_month,
    amount, currency_code, status, source_type, source_id, calculation_snapshot
  )
  select p_building_id, rows.unit_id, rows.unit_account_id, v_period.id, rows.obligation_type, rows.source_service_month,
    rows.amount, rows.currency_code, 'draft', rows.source_type, rows.source_id, rows.calculation_snapshot
  from jsonb_to_recordset(p_rows) as rows(
    unit_id uuid, unit_account_id uuid, obligation_type public.tb810_obligation_type, source_service_month date,
    amount numeric(12,2), currency_code text, source_type text, source_id uuid, calculation_snapshot jsonb
  );
  get diagnostics v_inserted_count = row_count;

  if cardinality(coalesce(p_gas_bill_ids, '{}')) > 0 or v_period.gas_reservation_state is not null then
    perform public.tb810_assert_gas_bill_reservation(v_period.id, p_building_id, p_gas_bill_ids);
    update public.tb810_gas_bills
    set processed_at = coalesce(processed_at, timezone('utc', now()))
    where building_id = p_building_id and id = any(coalesce(p_gas_bill_ids, '{}'));
  end if;

  update public.tb810_billing_periods set status = 'ready_for_review' where id = v_period.id;
  return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'ready_for_review', 'obligationRowCount', v_inserted_count);
end;
$$;

create or replace function public.tb810_mark_monthly_obligation_ready_for_review(
  p_building_id uuid, p_period_year integer, p_period_month integer,
  p_operating_year integer, p_operating_month integer, p_gas_bill_ids uuid[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'Staff role cannot hand off Monthly Obligations.';
  end if;
  return public.tb810_mark_monthly_obligation_ready_for_review_internal(p_building_id, p_period_year, p_period_month, p_operating_year, p_operating_month, p_gas_bill_ids);
end;
$$;

create or replace function public.tb810_mark_monthly_obligation_ready_for_review_system(
  p_building_id uuid, p_period_year integer, p_period_month integer,
  p_operating_year integer, p_operating_month integer, p_gas_bill_ids uuid[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'System execution requires the Supabase service role.'; end if;
  return public.tb810_mark_monthly_obligation_ready_for_review_internal(p_building_id, p_period_year, p_period_month, p_operating_year, p_operating_month, p_gas_bill_ids);
end;
$$;

create or replace function public.tb810_mark_dev_monthly_obligation_ready_for_review(
  p_session_id uuid, p_building_id uuid, p_period_year integer, p_period_month integer,
  p_operating_year integer, p_operating_month integer, p_gas_bill_ids uuid[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session public.tb810_dev_test_sessions%rowtype;
  v_period public.tb810_billing_periods%rowtype;
  v_period_exists boolean := false;
  v_period_before jsonb;
  v_gas_reservation_before jsonb := '[]'::jsonb;
  v_preexisting_obligation_count integer := 0;
  v_result jsonb;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then raise exception 'Staff role cannot hand off Monthly Obligations.'; end if;
  select * into v_session from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(format('%s:%s:%s', p_building_id, p_period_year, p_period_month), 0));
  select * into v_period from public.tb810_billing_periods where building_id = p_building_id and period_year = p_period_year and period_month = p_period_month for update;
  if found then
    v_period_exists := true; v_period_before := to_jsonb(v_period);
    select count(*) into v_preexisting_obligation_count from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id;
    if v_preexisting_obligation_count > 0 then raise exception 'DEV handoff requires a Billing Period with zero existing obligation rows.'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gb.id,
    'before_reserved_billing_period_id', gb.reserved_billing_period_id
  ) order by gb.id), '[]'::jsonb)
  into v_gas_reservation_before
  from public.tb810_gas_bills gb
  where gb.building_id = p_building_id
    and gb.id = any(coalesce(p_gas_bill_ids, '{}'));
  v_result := public.tb810_mark_monthly_obligation_ready_for_review_internal(p_building_id, p_period_year, p_period_month, p_operating_year, p_operating_month, p_gas_bill_ids);
  if v_result->>'status' <> 'ready_for_review' then return v_result; end if;
  select * into v_period from public.tb810_billing_periods where building_id = p_building_id and period_year = p_period_year and period_month = p_period_month for update;
  insert into public.tb810_dev_test_mutations (session_id, domain, record_type, operation, record_identity, before_state)
  values (p_session_id, 'obligations'::public.tb810_dev_test_domain, 'monthly_handoff',
    case when v_period_exists then 'update'::public.tb810_dev_test_operation else 'create'::public.tb810_dev_test_operation end,
    v_period.id::text, jsonb_build_object('building_id', p_building_id, 'obligation_month', format('%s-%s', p_period_year, lpad(p_period_month::text, 2, '0')), 'billing_period_existed', v_period_exists, 'billing_period_before', v_period_before, 'preexisting_obligation_count', v_preexisting_obligation_count, 'gas_reservation_before', v_gas_reservation_before));
  return v_result;
end;
$$;

create or replace function public.tb810_reset_dev_test_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
  v_gas_state jsonb;
begin
  perform 1 from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found'; end if;

  for mutation in
    select * from public.tb810_dev_test_mutations
    where session_id = p_session_id
      and domain = 'obligations'::public.tb810_dev_test_domain
      and record_type in ('monthly_handoff', 'monthly_snapshot')
      and operation in ('create', 'update')
    order by created_at desc, id desc
  loop
    if mutation.record_type = 'monthly_handoff' then
      for v_gas_state in select value from jsonb_array_elements(coalesce(mutation.before_state->'gas_reservation_before', '[]'::jsonb)) loop
        update public.tb810_gas_bills
        set reserved_billing_period_id = nullif(v_gas_state->>'before_reserved_billing_period_id', '')::uuid
        where id = (v_gas_state->>'id')::uuid
          and building_id = (mutation.before_state->>'building_id')::uuid
          and reserved_billing_period_id = mutation.record_identity::uuid;
      end loop;
    end if;
  end loop;

  perform public.tb810_reset_dev_test_session_base(p_session_id);
end;
$$;

revoke all on function public.tb810_assert_gas_bill_reservation(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.tb810_reset_dev_test_session(uuid) from public, anon;
grant execute on function public.tb810_reset_dev_test_session(uuid) to authenticated;

-- Extend the existing bounded facts RPC with the reservation state needed to
-- distinguish a native empty pool from a pre-K6 ready-for-review package.
create or replace function public.tb810_get_building_month_financial_facts(
  p_building_id uuid,
  p_plan_year integer,
  p_reading_month date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with reading_months as (
    select p_reading_month as current_reading_month,
      (p_reading_month + interval '1 month')::date as upcoming_reading_month,
      (p_reading_month + interval '1 month')::date as current_obligation_month,
      (p_reading_month + interval '2 months')::date as upcoming_obligation_month
  ),
  current_plan as (
    select bp.currency, bp.monthly_operating_budget from public.tb810_budget_plans bp
    where bp.building_id = p_building_id and bp.plan_year = p_plan_year limit 1
  ),
  upcoming_plan as (
    select bp.currency, bp.monthly_operating_budget from public.tb810_budget_plans bp
    where bp.building_id = p_building_id
      and bp.plan_year = extract(year from (select upcoming_obligation_month from reading_months))::integer limit 1
  ),
  common_water_type as (
    select to_jsonb(ut) as row from public.tb810_utility_types ut where ut.code = 'common_water' limit 1
  ),
  current_source_billing_period as (
    select bp.id from public.tb810_billing_periods bp where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_reading_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_reading_month from reading_months))::integer limit 1
  ),
  upcoming_source_billing_period as (
    select bp.id from public.tb810_billing_periods bp where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select upcoming_reading_month from reading_months))::integer
      and bp.period_month = extract(month from (select upcoming_reading_month from reading_months))::integer limit 1
  ),
  current_lifecycle as (
    select bp.id, bp.status, bp.gas_reservation_state from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') limit 1
  ),
  upcoming_lifecycle as (
    select bp.id, bp.status, bp.gas_reservation_state from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select upcoming_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select upcoming_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') limit 1
  ),
  current_snapshot as (
    select bp.id, bp.status, jsonb_build_object(
      'billingPeriodId', bp.id, 'status', bp.status,
      'components', jsonb_build_object(
        'fixed_assessment', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'fixed_assessment'), 0), 'count', count(*) filter (where o.obligation_type = 'fixed_assessment')),
        'water_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'water_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'water_consumption')),
        'common_water', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'common_water'), 0), 'count', count(*) filter (where o.obligation_type = 'common_water')),
        'gas_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'gas_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'gas_consumption')),
        'other_charge', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'other_charge'), 0), 'count', count(*) filter (where o.obligation_type = 'other_charge'))
      ), 'total', coalesce(sum(o.amount), 0)
    ) as snapshot
    from public.tb810_billing_periods bp join public.tb810_monthly_financial_obligations o on o.billing_period_id = bp.id
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
    group by bp.id, bp.status
  ),
  upcoming_snapshot as (
    select bp.id, bp.status, jsonb_build_object(
      'billingPeriodId', bp.id, 'status', bp.status,
      'components', jsonb_build_object(
        'fixed_assessment', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'fixed_assessment'), 0), 'count', count(*) filter (where o.obligation_type = 'fixed_assessment')),
        'water_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'water_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'water_consumption')),
        'common_water', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'common_water'), 0), 'count', count(*) filter (where o.obligation_type = 'common_water')),
        'gas_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'gas_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'gas_consumption')),
        'other_charge', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'other_charge'), 0), 'count', count(*) filter (where o.obligation_type = 'other_charge'))
      ), 'total', coalesce(sum(o.amount), 0)
    ) as snapshot
    from public.tb810_billing_periods bp join public.tb810_monthly_financial_obligations o on o.billing_period_id = bp.id
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select upcoming_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select upcoming_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
    group by bp.id, bp.status
  ),
  current_common_water_bill as (
    select to_jsonb(b) as row from public.tb810_utility_bills b join current_source_billing_period bp on bp.id = b.billing_period_id
    where b.building_id = p_building_id and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1) limit 1
  ),
  upcoming_common_water_bill as (
    select to_jsonb(b) as row from public.tb810_utility_bills b join upcoming_source_billing_period bp on bp.id = b.billing_period_id
    where b.building_id = p_building_id and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1) limit 1
  ),
  unit_rows as (
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'unit_number', u.unit_number, 'unit_type_id', u.unit_type_id, 'unit_type_code', ut.code, 'has_meter', u.has_meter, 'has_gas_service', u.has_gas_service, 'participation_percentage', u.participation_percentage) order by u.display_order, u.unit_number), '[]'::jsonb) as rows
    from public.tb810_units u join public.tb810_unit_types ut on ut.id = u.unit_type_id where u.building_id = p_building_id
  ),
  current_water_readings as (
    select coalesce(jsonb_agg(jsonb_build_object('unit_id', r.unit_id, 'reading_end', r.reading_end, 'consumption', r.consumption, 'reading_date', r.reading_date, 'created_at', r.created_at) order by r.created_at, r.unit_id), '[]'::jsonb) as rows
    from public.tb810_meter_readings r where r.building_id = p_building_id and r.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1) and r.reading_month = (select current_reading_month from reading_months)
  ),
  upcoming_water_readings as (
    select coalesce(jsonb_agg(jsonb_build_object('unit_id', r.unit_id, 'reading_end', r.reading_end, 'consumption', r.consumption, 'reading_date', r.reading_date, 'created_at', r.created_at) order by r.created_at, r.unit_id), '[]'::jsonb) as rows
    from public.tb810_meter_readings r where r.building_id = p_building_id and r.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1) and r.reading_month = (select upcoming_reading_month from reading_months)
  ),
  gas_bills as (
    select coalesce(jsonb_agg(to_jsonb(gb) order by gb.invoice_date desc, gb.created_at desc), '[]'::jsonb) as rows from public.tb810_gas_bills gb where gb.building_id = p_building_id
  ),
  current_gas_readings as (
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows from public.tb810_gas_readings gr where gr.building_id = p_building_id and gr.reading_month = (select current_reading_month from reading_months)
  ),
  upcoming_gas_readings as (
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows from public.tb810_gas_readings gr where gr.building_id = p_building_id and gr.reading_month = (select upcoming_reading_month from reading_months)
  ),
  charges as (
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb) as rows from public.tb810_charges c where c.building_id = p_building_id
  )
  select jsonb_build_object(
    'currentPlan', (select to_jsonb(current_plan) from current_plan),
    'upcomingPlan', (select to_jsonb(upcoming_plan) from upcoming_plan),
    'commonWaterType', (select row from common_water_type),
    'unitRows', (select rows from unit_rows), 'gasBills', (select rows from gas_bills), 'charges', (select rows from charges),
    'current', jsonb_build_object(
      'commonWaterBill', (select row from current_common_water_bill), 'waterReadings', (select rows from current_water_readings), 'gasReadings', (select rows from current_gas_readings),
      'obligationLifecycle', coalesce((select jsonb_build_object('mode', case when exists (select 1 from current_snapshot) then 'snapshotted' else 'live' end, 'billingPeriodId', current_lifecycle.id, 'billingPeriodStatus', current_lifecycle.status, 'gasReservationState', current_lifecycle.gas_reservation_state) from current_lifecycle), jsonb_build_object('mode', 'live', 'billingPeriodId', null, 'billingPeriodStatus', null, 'gasReservationState', null)),
      'obligationSnapshot', (select snapshot from current_snapshot)
    ),
    'upcoming', jsonb_build_object(
      'commonWaterBill', (select row from upcoming_common_water_bill), 'waterReadings', (select rows from upcoming_water_readings), 'gasReadings', (select rows from upcoming_gas_readings),
      'obligationLifecycle', coalesce((select jsonb_build_object('mode', case when exists (select 1 from upcoming_snapshot) then 'snapshotted' else 'live' end, 'billingPeriodId', upcoming_lifecycle.id, 'billingPeriodStatus', upcoming_lifecycle.status, 'gasReservationState', upcoming_lifecycle.gas_reservation_state) from upcoming_lifecycle), jsonb_build_object('mode', 'live', 'billingPeriodId', null, 'billingPeriodStatus', null, 'gasReservationState', null)),
      'obligationSnapshot', (select snapshot from upcoming_snapshot)
    )
  )
$$;

revoke all on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer, uuid[]) from public, anon, service_role;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer, integer, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.tb810_mark_dev_monthly_obligation_ready_for_review(uuid, uuid, integer, integer, integer, integer, uuid[]) from public, anon, service_role;
grant execute on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer, uuid[]) to authenticated;
grant execute on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer, integer, integer, uuid[]) to service_role;
grant execute on function public.tb810_mark_dev_monthly_obligation_ready_for_review(uuid, uuid, integer, integer, integer, integer, uuid[]) to authenticated;
