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

  select result.inserted_count, result.updated_count, result.processed_count
  into v_inserted_count, v_updated_count, v_processed_count
  from public.tb810_sync_meter_reading_import(p_month_key, p_rows) as result;

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
