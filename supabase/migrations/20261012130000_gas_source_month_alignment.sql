-- Gas source month alignment: Gas usage of month M is billed in obligation month M+1.
--
-- Gas meters are read at the start of each month, and a reading is filed
-- under the month in which it is taken: reading_month S closes the usage of
-- month S-1. Package M previously consumed reading_month M-1, which billed
-- usage of M-2 (October billed August usage). Package M now consumes
-- reading_month M, so October bills September usage, matching Legacy
-- (January 2025 usage on the February 2025 bill) and the workbook parity
-- fixtures.
--
-- Gas only. Unit Water and Sedapal keep source month S -> package S+1 and
-- continue to use tb810_lock_source_month_open directly. The Gas supplier
-- pool (selected_obligation_month) and calculateGasCharges are unchanged.
--
-- Changed:
-- - tb810_lock_gas_source_month_open: Gas reading month S is frozen by package S.
-- - the Gas freeze trigger, complete-set import and Start Over use it.
-- - tb810_assert_gas_provenance: the declared source month is the package month.
-- - tb810_get_building_month_financial_facts: package M reads Gas reading month M
--   (and M+1 for the upcoming package). Water and Sedapal selections are unchanged.

create or replace function public.tb810_lock_gas_source_month_open(
  p_building_id uuid,
  p_reading_month date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The shared helper freezes source month S against package S+1, so passing
  -- the month before the Gas reading month freezes it against package S.
  perform public.tb810_lock_source_month_open(
    p_building_id,
    (date_trunc('month', p_reading_month) - interval '1 month')::date,
    'Gas source month'
  );
end;
$$;

revoke all on function public.tb810_lock_gas_source_month_open(uuid, date)
  from public, anon, authenticated, service_role;

create or replace function public.tb810_guard_gas_reading_source_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_month date;
begin
  -- The DEV session reset restores DEV-owned facts it created.
  if coalesce(current_setting('tb810.dev_reset_gas_readings', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_building_id := case when tg_op = 'DELETE' then old.building_id else new.building_id end;
  if tg_op = 'UPDATE' and new.building_id is distinct from old.building_id then
    raise exception 'Gas readings cannot move between buildings.';
  end if;

  -- Deterministic ascending order across the origin and destination months.
  for v_month in
    select distinct m
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.reading_month end,
      case when tg_op in ('INSERT', 'UPDATE') then new.reading_month end
    ]) m
    where m is not null
    order by m
  loop
    perform public.tb810_lock_gas_source_month_open(v_building_id, v_month);
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.tb810_sync_gas_reading_import(p_month_key text, p_rows jsonb)
returns table(inserted_count integer, updated_count integer, processed_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_month_start date;
  v_next_month_start date;
  v_expected_count integer;
  v_submitted_count integer;
  v_row jsonb;
  v_unit_id uuid;
  v_reading_date date;
  v_current_reading numeric;
  v_previous_reading numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_existing_id uuid;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to import Gas readings.';
  end if;
  if p_month_key is null or p_month_key !~ '^\d{4}-\d{2}$' then
    raise exception 'A valid target operational month is required.';
  end if;

  select id into v_building_id from public.tb810_buildings order by created_at asc limit 1;
  if v_building_id is null then raise exception 'Current building not found.'; end if;

  v_month_start := make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);
  v_next_month_start := (v_month_start + interval '1 month')::date;
  perform pg_advisory_xact_lock(hashtextextended(v_building_id::text || ':' || p_month_key, 0));

  -- Gas source freeze, serialized against handoff/approval of package S.
  perform public.tb810_lock_gas_source_month_open(v_building_id, v_month_start);

  select count(*) into v_expected_count
  from public.tb810_units u
  join public.tb810_unit_types ut on ut.id = u.unit_type_id
  where u.building_id = v_building_id and ut.code = 'condo' and u.has_gas_service = true;
  v_submitted_count := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_submitted_count <> v_expected_count then
    raise exception 'Gas import must contain exactly % eligible Unit readings.', v_expected_count;
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := nullif(v_row->>'unit_id', '')::uuid;
    v_current_reading := nullif(v_row->>'current_reading', '')::numeric;
    v_reading_date := nullif(v_row->>'reading_date', '')::date;
    if v_unit_id is null or v_current_reading is null or v_reading_date is null then
      raise exception 'Every Gas reading requires a Unit, Current Reading, and Reading Date.';
    end if;
    if v_unit_id = any(v_seen) then raise exception 'Each eligible Gas Unit may appear only once.'; end if;
    v_seen := array_append(v_seen, v_unit_id);
    if not exists (
      select 1
      from public.tb810_units u
      join public.tb810_unit_types ut on ut.id = u.unit_type_id
      where u.id = v_unit_id and u.building_id = v_building_id and ut.code = 'condo' and u.has_gas_service = true
    ) then
      raise exception 'Gas import contains a non-eligible Unit.';
    end if;
    if v_reading_date < v_month_start or v_reading_date >= v_next_month_start then
      raise exception 'Reading date must belong to the selected operational month.';
    end if;
    select gr.current_reading into v_previous_reading
    from public.tb810_gas_readings gr
    where gr.building_id = v_building_id and gr.unit_id = v_unit_id and gr.reading_month < v_month_start
    order by gr.reading_month desc, gr.created_at desc limit 1;
    if v_previous_reading is not null and v_current_reading < v_previous_reading then
      raise exception 'Current reading must be greater than or equal to previous reading.';
    end if;
  end loop;

  inserted_count := 0;
  updated_count := 0;
  processed_count := 0;
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := (v_row->>'unit_id')::uuid;
    v_reading_date := (v_row->>'reading_date')::date;
    v_current_reading := (v_row->>'current_reading')::numeric;
    select gr.current_reading into v_previous_reading
    from public.tb810_gas_readings gr
    where gr.building_id = v_building_id and gr.unit_id = v_unit_id and gr.reading_month < v_month_start
    order by gr.reading_month desc, gr.created_at desc limit 1;
    select id into v_existing_id
    from public.tb810_gas_readings
    where building_id = v_building_id and unit_id = v_unit_id and reading_month = v_month_start
    for update;

    insert into public.tb810_gas_readings (
      building_id, unit_id, reading_month, reading_date, previous_reading, current_reading,
      consumption, legacy_table, legacy_id, legacy_metadata, updated_at
    ) values (
      v_building_id, v_unit_id, v_month_start, v_reading_date, v_previous_reading, v_current_reading,
      v_current_reading - coalesce(v_previous_reading, 0), 'gas_spreadsheet', null, '{}'::jsonb, now()
    )
    on conflict (building_id, unit_id, reading_month) do update set
      reading_date = excluded.reading_date,
      previous_reading = excluded.previous_reading,
      current_reading = excluded.current_reading,
      consumption = excluded.consumption,
      legacy_table = excluded.legacy_table,
      legacy_id = excluded.legacy_id,
      legacy_metadata = excluded.legacy_metadata,
      updated_at = excluded.updated_at;
    if v_existing_id is null then inserted_count := inserted_count + 1; else updated_count := updated_count + 1; end if;
    processed_count := processed_count + 1;
  end loop;
  return query select inserted_count, updated_count, processed_count;
end;
$$;

create or replace function public.tb810_clear_current_gas_reading_month_dev(
  p_month_key text,
  p_dev_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_month_start date;
  v_reading_ids uuid[];
  v_reading_count integer;
  v_owned_count integer;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to start over Gas readings.';
  end if;

  if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Gas month is invalid.';
  end if;
  v_month_start := make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);

  -- A source month never runs ahead of the operating month. The database has
  -- no DEV business date, so the production clock is the upper bound.
  if v_month_start > date_trunc('month', current_date)::date then
    raise exception 'Future Gas months cannot be started over.';
  end if;

  if p_dev_session_id is not null then
    perform 1
    from public.tb810_dev_test_sessions
    where id = p_dev_session_id
      and status = 'active'
    for update;
    if not found then
      raise exception 'DEV test session not active or not found.';
    end if;
  end if;

  select id into v_building_id
  from public.tb810_buildings
  order by created_at asc
  limit 1;
  if v_building_id is null then
    raise exception 'Current building not found.';
  end if;

  -- Gas source freeze, serialized against handoff/approval of package S.
  perform public.tb810_lock_gas_source_month_open(v_building_id, v_month_start);

  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_reading_ids, v_reading_count
  from public.tb810_gas_readings
  where building_id = v_building_id
    and reading_month = v_month_start;

  if p_dev_session_id is not null and v_reading_count > 0 then
    select count(*)::integer
    into v_owned_count
    from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_dev_session_id
      and mutation.domain = 'gas'::public.tb810_dev_test_domain
      and mutation.record_type = 'meter_reading'
      and mutation.operation = 'create'
      and mutation.record_identity = any(v_reading_ids::text[]);

    if v_owned_count <> v_reading_count then
      raise exception 'Start over is blocked because the current month includes readings not owned by this DEV session.';
    end if;
  end if;

  delete from public.tb810_gas_readings
  where id = any(v_reading_ids);

  if p_dev_session_id is not null and v_reading_count > 0 then
    delete from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_dev_session_id
      and mutation.domain = 'gas'::public.tb810_dev_test_domain
      and mutation.record_type = 'meter_reading'
      and mutation.operation = 'create'
      and mutation.record_identity = any(v_reading_ids::text[]);
  end if;

  return v_reading_count;
end;
$$;

create or replace function public.tb810_assert_gas_provenance(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
  p_gas_bill_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_label text := format('%s-%s', p_period_year, lpad(p_period_month::text, 2, '0'));
  v_source_month date := make_date(p_period_year, p_period_month, 1);
  v_requested uuid[];
  v_pool_total numeric;
  v_row jsonb;
  v_declared jsonb;
  v_declared_bills uuid[];
  v_gas_rows integer := 0;
begin
  select coalesce(array_agg(id order by id), '{}') into v_requested
  from (select distinct unnest(coalesce(p_gas_bill_ids, '{}')) as id) ids;
  select coalesce(sum(amount), 0) into v_pool_total
  from public.tb810_gas_bills
  where building_id = p_building_id and id = any(v_requested);

  for v_row in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
    where value->>'obligation_type' = 'gas_consumption'
  loop
    v_gas_rows := v_gas_rows + 1;
    v_declared := v_row->'calculation_snapshot'->'gasProvenance';
    if jsonb_typeof(v_declared) is distinct from 'object'
       or not (v_declared ?& array['sourceMonth', 'readingId', 'unitConsumption', 'billIds', 'poolTotal'])
       or jsonb_typeof(v_declared->'billIds') is distinct from 'array' then
      raise exception 'Gas provenance is missing from the % Monthly Obligations package.', v_month_label;
    end if;

    select coalesce(array_agg(value::uuid order by value::uuid), '{}') into v_declared_bills
    from jsonb_array_elements_text(v_declared->'billIds');

    if v_declared->>'sourceMonth' <> to_char(v_source_month, 'YYYY-MM')
       or v_declared_bills <> v_requested
       or (v_declared->>'poolTotal')::numeric <> v_pool_total
       or not exists (
         select 1
         from public.tb810_gas_readings gr
         where gr.id = (v_declared->>'readingId')::uuid
           and gr.building_id = p_building_id
           and gr.unit_id = (v_row->>'unit_id')::uuid
           and gr.reading_month = v_source_month
           and gr.consumption = (v_declared->>'unitConsumption')::numeric
       ) then
      raise exception 'Gas source changed after review for the % Monthly Obligations package.', v_month_label;
    end if;
  end loop;

  if v_gas_rows = 0 and cardinality(v_requested) > 0 then
    raise exception 'Gas provenance is missing from the % Monthly Obligations package.', v_month_label;
  end if;
end;
$$;

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
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows from public.tb810_gas_readings gr where gr.building_id = p_building_id and gr.reading_month = (select upcoming_reading_month from reading_months)
  ),
  upcoming_gas_readings as (
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows from public.tb810_gas_readings gr where gr.building_id = p_building_id and gr.reading_month = ((select upcoming_reading_month from reading_months) + interval '1 month')::date
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

