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

create or replace function public.tb810_sync_dev_meter_reading_import(
  p_session_id uuid,
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
  v_row jsonb;
  v_unit_id uuid;
  v_existing_id uuid;
  v_before_state jsonb;
  v_pre_state jsonb := '[]'::jsonb;
  v_after_id uuid;
  v_mutation jsonb;
  v_inserted_count integer;
  v_updated_count integer;
  v_processed_count integer;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to import meter readings.';
  end if;

  perform 1 from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found.'; end if;

  select id into v_building_id from public.tb810_buildings order by created_at asc limit 1;
  select id into v_utility_type_id from public.tb810_utility_types where code = 'common_water';
  v_month_start := make_date(split_part(p_month_key, '-', 1)::int, split_part(p_month_key, '-', 2)::int, 1);

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := nullif(v_row->>'unit_id', '')::uuid;
    v_existing_id := null;
    v_before_state := null;
    select mr.id, to_jsonb(mr) into v_existing_id, v_before_state
    from public.tb810_meter_readings as mr
    where mr.building_id = v_building_id and mr.unit_id = v_unit_id
      and mr.utility_type_id = v_utility_type_id and mr.reading_month = v_month_start
    limit 1;
    v_pre_state := v_pre_state || jsonb_build_array(jsonb_build_object(
      'unit_id', v_unit_id,
      'operation', case when v_existing_id is null then 'create' else 'update' end,
      'before_state', v_before_state
    ));
  end loop;

  select inserted_count, updated_count, processed_count
  into v_inserted_count, v_updated_count, v_processed_count
  from public.tb810_sync_meter_reading_import(p_month_key, p_rows);

  for v_mutation in select * from jsonb_array_elements(v_pre_state) loop
    select id into v_after_id
    from public.tb810_meter_readings
    where building_id = v_building_id and unit_id = (v_mutation->>'unit_id')::uuid
      and utility_type_id = v_utility_type_id and reading_month = v_month_start
    limit 1;
    insert into public.tb810_dev_test_mutations (
      session_id, domain, record_type, operation, record_identity, before_state
    ) values (
      p_session_id,
      'water'::public.tb810_dev_test_domain,
      'meter_reading',
      (v_mutation->>'operation')::public.tb810_dev_test_operation,
      v_after_id::text,
      v_mutation->'before_state'
    );
  end loop;

  return query select v_inserted_count, v_updated_count, v_processed_count;
end;
$$;

revoke all on function public.tb810_sync_dev_meter_reading_import(uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.tb810_sync_dev_meter_reading_import(uuid, text, jsonb) to authenticated;
