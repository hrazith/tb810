create or replace function public.tb810_mark_monthly_obligation_ready_for_review_internal(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer
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
  p_period_month integer
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
  return public.tb810_mark_monthly_obligation_ready_for_review_internal(p_building_id, p_period_year, p_period_month);
end;
$$;

create or replace function public.tb810_mark_monthly_obligation_ready_for_review_system(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer
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
  return public.tb810_mark_monthly_obligation_ready_for_review_internal(p_building_id, p_period_year, p_period_month);
end;
$$;

create or replace function public.tb810_approve_monthly_obligation(
  p_billing_period_id uuid,
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
  v_persisted jsonb;
begin
  if not public.has_tb810_role('super_admin') then
    raise exception 'Only an authorized financial administrator can approve Monthly Obligations.';
  end if;

  select * into v_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;
  if not found then
    raise exception 'Billing Period not found.';
  end if;
  if v_period.status = 'approved' then
    return jsonb_build_object('status', 'approved');
  end if;
  if v_period.status <> 'ready_for_review' then
    raise exception 'Billing Period cannot be approved from status %.', v_period.status;
  end if;

  select count(*) into v_row_count
  from public.tb810_monthly_financial_obligations
  where billing_period_id = v_period.id;

  if v_row_count = 0 then
    update public.tb810_billing_periods
    set status = 'collecting_readings'
    where id = v_period.id;
    v_persisted := public.tb810_persist_monthly_obligation_snapshot(
      v_period.building_id,
      p_period_year,
      p_period_month,
      p_rows,
      p_gas_bill_ids
    );
    if v_persisted->>'status' <> 'ready_for_review' then
      raise exception 'Monthly Obligation snapshot could not be created.';
    end if;
  end if;

  update public.tb810_billing_periods
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = timezone('utc', now())
  where id = v_period.id
    and status = 'ready_for_review';
  if not found then
    raise exception 'Billing Period changed before approval.';
  end if;

  return jsonb_build_object('status', 'approved');
end;
$$;

revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_internal(uuid, integer, integer) from public;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer) from public, anon;
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.tb810_approve_monthly_obligation(uuid, integer, integer, jsonb, uuid[]) from public, anon;
grant execute on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer) to authenticated;
grant execute on function public.tb810_mark_monthly_obligation_ready_for_review_system(uuid, integer, integer) to service_role;
grant execute on function public.tb810_approve_monthly_obligation(uuid, integer, integer, jsonb, uuid[]) to authenticated;

create or replace function public.tb810_approve_dev_monthly_obligation(
  p_session_id uuid,
  p_billing_period_id uuid,
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
  v_session public.tb810_dev_test_sessions%rowtype;
  v_period public.tb810_billing_periods%rowtype;
  v_gas_before jsonb := '[]'::jsonb;
  v_gas_after jsonb := '[]'::jsonb;
  v_persisted jsonb;
  v_row_count integer;
begin
  if not public.has_tb810_role('super_admin') then
    raise exception 'Only an authorized financial administrator can approve Monthly Obligations.';
  end if;

  select * into v_session
  from public.tb810_dev_test_sessions
  where id = p_session_id and status = 'active'
  for update;
  if not found then
    raise exception 'DEV test session not active or not found.';
  end if;

  select * into v_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;
  if not found then
    raise exception 'Billing Period not found.';
  end if;
  select count(*) into v_row_count
  from public.tb810_monthly_financial_obligations
  where billing_period_id = v_period.id;
  if v_row_count <> 0 then
    raise exception 'DEV approval requires a Billing Period with zero existing obligation rows.';
  end if;
  if v_period.status <> 'ready_for_review' then
    raise exception 'Billing Period cannot be approved from status %.', v_period.status;
  end if;

  if cardinality(p_gas_bill_ids) > 0 then
    perform 1
    from public.tb810_gas_bills
    where building_id = v_period.building_id and id = any(p_gas_bill_ids)
    for update;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'before_processed_at', processed_at) order by id), '[]'::jsonb)
    into v_gas_before
    from public.tb810_gas_bills
    where building_id = v_period.building_id and id = any(p_gas_bill_ids);
  end if;

  update public.tb810_billing_periods
  set status = 'collecting_readings'
  where id = v_period.id;
  v_persisted := public.tb810_persist_monthly_obligation_snapshot(
    v_period.building_id, p_period_year, p_period_month, p_rows, p_gas_bill_ids
  );
  if v_persisted->>'status' <> 'ready_for_review' then
    raise exception 'Monthly Obligation snapshot could not be created.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gb.id,
    'before_processed_at', state.value->'before_processed_at',
    'after_processed_at', gb.processed_at
  ) order by gb.id), '[]'::jsonb)
  into v_gas_after
  from public.tb810_gas_bills gb
  join jsonb_array_elements(v_gas_before) state on state.value->>'id' = gb.id::text
  where gb.building_id = v_period.building_id and gb.id = any(p_gas_bill_ids);

  insert into public.tb810_dev_test_mutations (
    session_id, domain, record_type, operation, record_identity, before_state
  ) values (
    p_session_id, 'obligations'::public.tb810_dev_test_domain, 'monthly_snapshot', 'create',
    v_period.id::text,
    jsonb_build_object(
      'building_id', v_period.building_id,
      'obligation_month', format('%s-%s', p_period_year, lpad(p_period_month::text, 2, '0')),
      'billing_period_existed', true,
      'billing_period_before', to_jsonb(v_period),
      'preexisting_obligation_count', 0,
      'created_obligation_count', (v_persisted->>'obligationRowCount')::integer,
      'gas_supplier_bills', v_gas_after
    )
  );

  update public.tb810_billing_periods
  set status = 'approved', approved_by = auth.uid(), approved_at = timezone('utc', now())
  where id = v_period.id and status = 'ready_for_review';
  if not found then
    raise exception 'Billing Period changed before approval.';
  end if;
  return jsonb_build_object('status', 'approved');
end;
$$;

revoke execute on function public.tb810_approve_dev_monthly_obligation(uuid, uuid, integer, integer, jsonb, uuid[]) from public, anon;
grant execute on function public.tb810_approve_dev_monthly_obligation(uuid, uuid, integer, integer, jsonb, uuid[]) to authenticated;

create or replace function public.tb810_prepare_dev_monthly_obligation_reset(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
  v_period public.tb810_billing_periods%rowtype;
begin
  if not public.has_tb810_role('building_manager') and not public.has_tb810_role('super_admin') then
    raise exception 'Staff role cannot reset DEV Monthly Obligations.';
  end if;
  perform 1 from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found.'; end if;

  select * into mutation
  from public.tb810_dev_test_mutations
  where session_id = p_session_id and domain::text = 'obligations'
    and record_type = 'monthly_snapshot' and operation = 'create'
  order by created_at desc limit 1;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;

  select * into v_period from public.tb810_billing_periods
  where id = mutation.record_identity::uuid for update;
  if not found then raise exception 'DEV snapshot Billing Period no longer exists.'; end if;
  if v_period.status = 'approved' then
    update public.tb810_billing_periods
    set status = 'ready_for_review', approved_by = null, approved_at = null
    where id = v_period.id;
  elsif v_period.status <> 'ready_for_review' then
    raise exception 'DEV snapshot reset requires an approved or ready_for_review Billing Period.';
  end if;
  return jsonb_build_object('status', 'ready_for_reset');
end;
$$;

revoke execute on function public.tb810_prepare_dev_monthly_obligation_reset(uuid) from public, anon;
grant execute on function public.tb810_prepare_dev_monthly_obligation_reset(uuid) to authenticated;

create or replace function public.tb810_assert_monthly_obligation_snapshot_integrity(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = p_period_year
      and bp.period_month = p_period_month
      and bp.status in ('approved', 'invoices_generated', 'closed')
      and not exists (
        select 1
        from public.tb810_monthly_financial_obligations o
        where o.billing_period_id = bp.id
      )
  ) then
    raise exception 'Billing Period is finalized without persisted obligations.';
  end if;
  return true;
end;
$$;

revoke all on function public.tb810_assert_monthly_obligation_snapshot_integrity(uuid, integer, integer) from public, anon, authenticated;

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
    select
      p_reading_month as current_reading_month,
      (p_reading_month + interval '1 month')::date as upcoming_reading_month,
      (p_reading_month + interval '1 month')::date as current_obligation_month,
      (p_reading_month + interval '2 months')::date as upcoming_obligation_month
  ),
  current_plan as (
    select bp.currency, bp.monthly_operating_budget
    from public.tb810_budget_plans bp
    where bp.building_id = p_building_id and bp.plan_year = p_plan_year limit 1
  ),
  upcoming_plan as (
    select bp.currency, bp.monthly_operating_budget
    from public.tb810_budget_plans bp
    where bp.building_id = p_building_id
      and bp.plan_year = extract(year from (select upcoming_obligation_month from reading_months))::integer limit 1
  ),
  common_water_type as (
    select to_jsonb(ut) as row from public.tb810_utility_types ut where ut.code = 'common_water' limit 1
  ),
  current_source_billing_period as (
    select bp.id from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_reading_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_reading_month from reading_months))::integer limit 1
  ),
  upcoming_source_billing_period as (
    select bp.id from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select upcoming_reading_month from reading_months))::integer
      and bp.period_month = extract(month from (select upcoming_reading_month from reading_months))::integer limit 1
  ),
  current_lifecycle as (
    select bp.id, bp.status
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
    limit 1
  ),
  upcoming_lifecycle as (
    select bp.id, bp.status
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select upcoming_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select upcoming_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
    limit 1
  ),
  integrity_check as (
    select
      public.tb810_assert_monthly_obligation_snapshot_integrity(
        p_building_id,
        extract(year from (select current_obligation_month from reading_months))::integer,
        extract(month from (select current_obligation_month from reading_months))::integer
      ) as current_ok,
      public.tb810_assert_monthly_obligation_snapshot_integrity(
        p_building_id,
        extract(year from (select upcoming_obligation_month from reading_months))::integer,
        extract(month from (select upcoming_obligation_month from reading_months))::integer
      ) as upcoming_ok
  ),
  current_snapshot as (
    select bp.id, bp.status,
      jsonb_build_object(
        'billingPeriodId', bp.id, 'status', bp.status,
        'components', jsonb_build_object(
          'fixed_assessment', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'fixed_assessment'), 0), 'count', count(*) filter (where o.obligation_type = 'fixed_assessment')),
          'water_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'water_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'water_consumption')),
          'common_water', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'common_water'), 0), 'count', count(*) filter (where o.obligation_type = 'common_water')),
          'gas_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'gas_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'gas_consumption')),
          'other_charge', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'other_charge'), 0), 'count', count(*) filter (where o.obligation_type = 'other_charge'))
        ), 'total', coalesce(sum(o.amount), 0)
      ) as snapshot
    from public.tb810_billing_periods bp
    join public.tb810_monthly_financial_obligations o on o.billing_period_id = bp.id
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_obligation_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_obligation_month from reading_months))::integer
      and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
    group by bp.id, bp.status
  ),
  upcoming_snapshot as (
    select bp.id, bp.status,
      jsonb_build_object(
        'billingPeriodId', bp.id, 'status', bp.status,
        'components', jsonb_build_object(
          'fixed_assessment', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'fixed_assessment'), 0), 'count', count(*) filter (where o.obligation_type = 'fixed_assessment')),
          'water_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'water_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'water_consumption')),
          'common_water', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'common_water'), 0), 'count', count(*) filter (where o.obligation_type = 'common_water')),
          'gas_consumption', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'gas_consumption'), 0), 'count', count(*) filter (where o.obligation_type = 'gas_consumption')),
          'other_charge', jsonb_build_object('amount', coalesce(sum(o.amount) filter (where o.obligation_type = 'other_charge'), 0), 'count', count(*) filter (where o.obligation_type = 'other_charge'))
        ), 'total', coalesce(sum(o.amount), 0)
      ) as snapshot
    from public.tb810_billing_periods bp
    join public.tb810_monthly_financial_obligations o on o.billing_period_id = bp.id
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
      'obligationLifecycle', coalesce((select jsonb_build_object('mode', case when exists (select 1 from current_snapshot) then 'snapshotted' else 'live' end, 'billingPeriodId', current_lifecycle.id, 'billingPeriodStatus', current_lifecycle.status) from current_lifecycle), jsonb_build_object('mode', 'live', 'billingPeriodId', null, 'billingPeriodStatus', null)),
      'obligationSnapshot', (select snapshot from current_snapshot)
    ),
    'upcoming', jsonb_build_object(
      'commonWaterBill', (select row from upcoming_common_water_bill), 'waterReadings', (select rows from upcoming_water_readings), 'gasReadings', (select rows from upcoming_gas_readings),
      'obligationLifecycle', coalesce((select jsonb_build_object('mode', case when exists (select 1 from upcoming_snapshot) then 'snapshotted' else 'live' end, 'billingPeriodId', upcoming_lifecycle.id, 'billingPeriodStatus', upcoming_lifecycle.status) from upcoming_lifecycle), jsonb_build_object('mode', 'live', 'billingPeriodId', null, 'billingPeriodStatus', null)),
      'obligationSnapshot', (select snapshot from upcoming_snapshot)
    )
    )
  from integrity_check
$$;
