create or replace function public.tb810_sync_gas_reading_import(
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

  select count(*) into v_expected_count
  from public.tb810_units
  where building_id = v_building_id and unit_type_code = 'condo' and has_gas_service = true;
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
      select 1 from public.tb810_units
      where id = v_unit_id and building_id = v_building_id and unit_type_code = 'condo' and has_gas_service = true
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

create or replace function public.tb810_sync_dev_gas_reading_import(
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
  v_month_start date;
  v_row jsonb;
  v_unit_id uuid;
  v_existing_id uuid;
  v_before_state jsonb;
  v_after_id uuid;
  v_result record;
  v_pre_state jsonb := '[]'::jsonb;
  v_mutation jsonb;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to import Gas readings.';
  end if;
  perform 1 from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found.'; end if;
  select id into v_building_id from public.tb810_buildings order by created_at asc limit 1;
  v_month_start := make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := nullif(v_row->>'unit_id', '')::uuid;
    select gr.id, to_jsonb(gr) into v_existing_id, v_before_state
    from public.tb810_gas_readings gr
    where gr.building_id = v_building_id and gr.unit_id = v_unit_id and gr.reading_month = v_month_start
    for update;
    v_pre_state := v_pre_state || jsonb_build_array(jsonb_build_object(
      'unit_id', v_unit_id,
      'operation', case when v_existing_id is null then 'create' else 'update' end,
      'before_state', v_before_state
    ));
  end loop;

  select * into v_result from public.tb810_sync_gas_reading_import(p_month_key, p_rows);
  for v_mutation in select value from jsonb_array_elements(v_pre_state) loop
    select id into v_after_id
    from public.tb810_gas_readings
    where building_id = v_building_id
      and unit_id = (v_mutation->>'unit_id')::uuid
      and reading_month = v_month_start;
    insert into public.tb810_dev_test_mutations (session_id, domain, record_type, operation, record_identity, before_state)
    values (
      p_session_id,
      'gas'::public.tb810_dev_test_domain,
      'meter_reading',
      (v_mutation->>'operation')::public.tb810_dev_test_operation,
      v_after_id::text,
      v_mutation->'before_state'
    ) on conflict (session_id, domain, record_type, operation, record_identity) do nothing;
  end loop;
  return query select v_result.inserted_count, v_result.updated_count, v_result.processed_count;
end;
$$;

revoke all on function public.tb810_sync_gas_reading_import(text, jsonb) from public, anon, service_role;
grant execute on function public.tb810_sync_gas_reading_import(text, jsonb) to authenticated;
revoke all on function public.tb810_sync_dev_gas_reading_import(uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.tb810_sync_dev_gas_reading_import(uuid, text, jsonb) to authenticated;

alter function public.tb810_reset_dev_test_session(uuid) rename to tb810_reset_dev_test_session_base;

create or replace function public.tb810_reset_dev_test_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
begin
  perform 1 from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found'; end if;
  for mutation in
    select * from public.tb810_dev_test_mutations
    where session_id = p_session_id and domain = 'gas'::public.tb810_dev_test_domain
      and record_type = 'meter_reading' and operation = 'update'
    order by created_at desc, id desc
  loop
    update public.tb810_gas_readings
    set building_id = (mutation.before_state->>'building_id')::uuid,
        unit_id = (mutation.before_state->>'unit_id')::uuid,
        reading_month = (mutation.before_state->>'reading_month')::date,
        reading_date = (mutation.before_state->>'reading_date')::date,
        previous_reading = nullif(mutation.before_state->>'previous_reading', '')::numeric,
        current_reading = (mutation.before_state->>'current_reading')::numeric,
        consumption = nullif(mutation.before_state->>'consumption', '')::numeric,
        notes = mutation.before_state->>'notes',
        legacy_table = mutation.before_state->>'legacy_table',
        legacy_id = mutation.before_state->>'legacy_id',
        legacy_metadata = coalesce((mutation.before_state->'legacy_metadata')::jsonb, '{}'::jsonb),
        created_at = (mutation.before_state->>'created_at')::timestamptz,
        updated_at = (mutation.before_state->>'updated_at')::timestamptz
    where id = mutation.record_identity::uuid;
  end loop;
  perform public.tb810_reset_dev_test_session_base(p_session_id);
end;
$$;

revoke all on function public.tb810_reset_dev_test_session_base(uuid) from public, anon, authenticated, service_role;
revoke all on function public.tb810_reset_dev_test_session(uuid) from public, anon;
grant execute on function public.tb810_reset_dev_test_session(uuid) to authenticated;
