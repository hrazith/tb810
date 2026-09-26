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
  v_reading_ids uuid[];
  v_reading_count integer;
  v_owned_count integer;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to start over Unit Water readings.';
  end if;

  if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_month_key <> to_char(current_date, 'YYYY-MM') then
    raise exception 'Only the current editable Unit Water month can be started over.';
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

  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_reading_ids, v_reading_count
  from public.tb810_meter_readings
  where building_id = v_building_id
    and utility_type_id = v_utility_type_id
    and reading_month = make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);

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
