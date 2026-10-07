-- Unit Water bulk mutations follow the canonical source-freeze contract.
--
-- Source month S is consumed by Monthly Obligation package S+1.
--   S+1 absent / draft / collecting_readings / ready_for_review -> editable
--   S+1 approved / invoices_generated / closed                  -> frozen
--
-- The freeze check that 20261006120000 established for Sedapal sources is
-- extracted into one month-keyed helper so Sedapal and Unit Water assert the
-- same financial invariant: take the K6 package advisory lock for S+1 SHARED
-- (approval and snapshot persistence take it EXCLUSIVELY), then read the S+1
-- status inside the lock.
--
-- Unit Water Start Over previously accepted only to_char(current_date,
-- 'YYYY-MM'), so a complete prior source month whose consuming package is
-- still open (e.g. September 2026 while October 2026 is live) could not be
-- started over. Unit Water bulk import had no database freeze at all; the DEV
-- import writes through it and is covered by the same check.

create or replace function public.tb810_lock_source_month_open(
  p_building_id uuid,
  p_source_month date,
  p_source_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consuming_month date := (date_trunc('month', p_source_month) + interval '1 month')::date;
  v_status text;
begin
  perform pg_advisory_xact_lock_shared(public.tb810_monthly_obligation_package_lock_key(
    p_building_id,
    extract(year from v_consuming_month)::integer,
    extract(month from v_consuming_month)::integer
  ));

  -- Status is read only after the lock is held (new statement snapshot).
  select bp.status into v_status
  from public.tb810_billing_periods bp
  where bp.building_id = p_building_id
    and bp.period_year = extract(year from v_consuming_month)::integer
    and bp.period_month = extract(month from v_consuming_month)::integer;

  if v_status in ('approved', 'invoices_generated', 'closed') then
    raise exception 'This % is locked because the % Monthly Obligations package is %.',
      p_source_label, to_char(v_consuming_month, 'YYYY-MM'), v_status;
  end if;
end;
$$;

revoke all on function public.tb810_lock_source_month_open(uuid, date, text) from public, anon, authenticated;

-- Sedapal keeps its contract and messages; it now delegates the freeze check.
create or replace function public.tb810_lock_common_water_source_periods(
  p_building_id uuid,
  p_source_period_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source record;
begin
  if exists (select 1 from unnest(coalesce(p_source_period_ids, '{}')) requested(id) where requested.id is null) then
    raise exception 'Common water bills must remain attached to a source Billing Period.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_source_period_ids, '{}')) requested(id)
    left join public.tb810_billing_periods bp
      on bp.id = requested.id
     and bp.building_id = p_building_id
    where bp.id is null
  ) then
    raise exception 'Common water source Billing Period was not found for this building.';
  end if;

  -- Deterministic ascending order; shared locks never conflict with each other.
  for v_source in
    select distinct make_date(bp.period_year, bp.period_month, 1) as source_month
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.id = any(p_source_period_ids)
    order by source_month
  loop
    perform public.tb810_lock_source_month_open(p_building_id, v_source.source_month, 'Sedapal source');
  end loop;
end;
$$;

revoke all on function public.tb810_lock_common_water_source_periods(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.tb810_clear_current_unit_water_month(
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
  v_utility_type_id uuid;
  v_month_start date;
  v_reading_ids uuid[];
  v_reading_count integer;
  v_owned_count integer;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to start over Unit Water readings.';
  end if;

  if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Unit Water month is invalid.';
  end if;
  v_month_start := make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);

  -- A source month never runs ahead of the operating month. The database has
  -- no DEV business date, so the production clock is the upper bound.
  if v_month_start > date_trunc('month', current_date)::date then
    raise exception 'Future Unit Water months cannot be started over.';
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

  select id into v_utility_type_id
  from public.tb810_utility_types
  where code = 'common_water'
  limit 1;
  if v_utility_type_id is null then
    raise exception 'Common Water utility type is missing.';
  end if;

  -- Canonical source freeze, serialized against handoff/approval of S+1.
  perform public.tb810_lock_source_month_open(v_building_id, v_month_start, 'Unit Water month');

  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_reading_ids, v_reading_count
  from public.tb810_meter_readings
  where building_id = v_building_id
    and utility_type_id = v_utility_type_id
    and reading_month = v_month_start;

  if p_dev_session_id is not null and v_reading_count > 0 then
    select count(*)::integer
    into v_owned_count
    from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_dev_session_id
      and mutation.domain = 'water'
      and mutation.record_type = 'meter_reading'
      and mutation.operation = 'create'
      and mutation.record_identity = any(v_reading_ids::text[]);

    if v_owned_count <> v_reading_count then
      raise exception 'Start over is blocked because the current month includes readings not owned by this DEV session.';
    end if;
  end if;

  delete from public.tb810_meter_readings
  where id = any(v_reading_ids);

  if p_dev_session_id is not null and v_reading_count > 0 then
    delete from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_dev_session_id
      and mutation.domain = 'water'
      and mutation.record_type = 'meter_reading'
      and mutation.operation = 'create'
      and mutation.record_identity = any(v_reading_ids::text[]);
  end if;

  return v_reading_count;
end;
$$;

revoke all on function public.tb810_clear_current_unit_water_month(text, uuid) from public, anon, service_role;
grant execute on function public.tb810_clear_current_unit_water_month(text, uuid) to authenticated;

-- Same body as 20260924120000, plus the source-freeze check. Grants are unchanged.
create or replace function public.tb810_sync_meter_reading_import(
  p_month_key text,
  p_rows jsonb
)
returns table (
  inserted_count integer,
  updated_count integer,
  processed_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_utility_type_id uuid;
  v_month_start date;
  v_next_month_start date;
  v_row jsonb;
  v_unit_id uuid;
  v_reading_end numeric;
  v_reading_date date;
  v_previous_reading numeric;
  v_reading_start numeric;
  v_consumption numeric;
  v_existing record;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to import meter readings.';
  end if;

  select id into v_building_id from public.tb810_buildings order by created_at asc limit 1;
  if v_building_id is null then raise exception 'Current building not found.'; end if;

  select id into v_utility_type_id from public.tb810_utility_types where code = 'common_water';
  if v_utility_type_id is null then raise exception 'Common Water utility type is missing.'; end if;

  v_month_start := make_date(split_part(p_month_key, '-', 1)::int, split_part(p_month_key, '-', 2)::int, 1);
  v_next_month_start := (v_month_start + interval '1 month')::date;

  -- Canonical source freeze, serialized against handoff/approval of S+1,
  -- before any reading of the month is read or written.
  perform public.tb810_lock_source_month_open(v_building_id, v_month_start, 'Unit Water month');

  inserted_count := 0;
  updated_count := 0;
  processed_count := 0;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := nullif(v_row->>'unit_id', '')::uuid;
    v_reading_end := nullif(v_row->>'reading_end', '')::numeric;
    v_reading_date := coalesce(nullif(v_row->>'reading_date', '')::date, v_month_start);
    if v_unit_id is null or v_reading_end is null then
      raise exception 'Imported meter readings are missing required values.';
    end if;
    if v_reading_date < v_month_start or v_reading_date >= v_next_month_start then
      raise exception 'Reading date must belong to the selected month.';
    end if;

    select id into v_existing
    from public.tb810_meter_readings
    where building_id = v_building_id and unit_id = v_unit_id
      and utility_type_id = v_utility_type_id and reading_month = v_month_start
    limit 1;

    select mr.reading_end into v_previous_reading
    from public.tb810_meter_readings mr
    where mr.building_id = v_building_id and mr.unit_id = v_unit_id
      and mr.utility_type_id = v_utility_type_id and mr.reading_date < v_month_start
    order by mr.reading_date desc, mr.created_at desc limit 1;

    v_reading_start := v_previous_reading;
    v_consumption := case when v_reading_start is null then null else round(v_reading_end - v_reading_start, 3) end;

    if v_existing.id is null then
      insert into public.tb810_meter_readings (
        building_id, unit_id, utility_type_id, reading_date, reading_start, reading_end,
        consumption, unit_of_measure, status, notes, entered_at
      ) values (
        v_building_id, v_unit_id, v_utility_type_id, v_reading_date, v_reading_start, v_reading_end,
        v_consumption, 'm3', 'recorded', null, now()
      );
      inserted_count := inserted_count + 1;
    else
      update public.tb810_meter_readings
      set reading_date = v_reading_date, reading_start = v_reading_start, reading_end = v_reading_end,
          consumption = v_consumption, unit_of_measure = 'm3', status = 'recorded', notes = null
      where id = v_existing.id;
      updated_count := updated_count + 1;
    end if;
    processed_count := processed_count + 1;
  end loop;

  return query select inserted_count, updated_count, processed_count;
end;
$$;
