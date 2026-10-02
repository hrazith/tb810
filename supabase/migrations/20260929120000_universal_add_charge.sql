create or replace function public.tb810_create_bulk_charge(
  p_target_kind text,
  p_description text,
  p_amount numeric,
  p_schedule text,
  p_starts_month text,
  p_ends_month text default null,
  p_dev_session_id uuid default null
)
returns table (
  series_id uuid,
  inserted_count integer,
  total_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_series_id uuid := gen_random_uuid();
  v_start_month date;
  v_end_month date;
  v_target_id uuid;
  v_target_count integer := 0;
  v_session_status public.tb810_dev_test_session_status;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to create charges.';
  end if;
  if p_target_kind not in ('all_units', 'all_owners') then
    raise exception 'Bulk charge target is invalid.';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception 'Description is required.';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Amount must be non-zero.';
  end if;
  if p_schedule not in ('one_off', 'recurring') then
    raise exception 'Charge schedule is invalid.';
  end if;
  if p_starts_month is null or p_starts_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Start month must be YYYY-MM.';
  end if;
  v_start_month := make_date(split_part(p_starts_month, '-', 1)::integer, split_part(p_starts_month, '-', 2)::integer, 1);
  if p_ends_month is not null and p_ends_month <> '' then
    if p_ends_month !~ '^\d{4}-\d{2}$' then
      raise exception 'End month must be YYYY-MM.';
    end if;
    v_end_month := make_date(split_part(p_ends_month, '-', 1)::integer, split_part(p_ends_month, '-', 2)::integer, 1);
  end if;
  if p_schedule = 'one_off' and v_end_month is not null then
    raise exception 'One-off charges cannot have an end month.';
  end if;
  if v_end_month is not null and v_end_month < v_start_month then
    raise exception 'End month cannot be before the start month.';
  end if;

  select id into v_building_id
  from public.tb810_buildings
  order by created_at asc
  limit 1;
  if v_building_id is null then
    raise exception 'Current building not found.';
  end if;

  if p_dev_session_id is not null then
    select status into v_session_status
    from public.tb810_dev_test_sessions
    where id = p_dev_session_id
    for update;
    if v_session_status is distinct from 'active' then
      raise exception 'DEV test session not active or not found.';
    end if;
  end if;

  if p_target_kind = 'all_units' then
    for v_target_id in
      select u.id
      from public.tb810_units u
      join public.tb810_unit_types ut on ut.id = u.unit_type_id
      where u.building_id = v_building_id
        and u.active
        and ut.code = 'condo'
      order by u.display_order, u.unit_number
    loop
      insert into public.tb810_charges (
        series_id, building_id, unit_id, description, amount, schedule,
        effective_from_month, effective_to_month, legacy_metadata
      ) values (
        v_series_id, v_building_id, v_target_id, trim(p_description), p_amount,
        p_schedule::public.tb810_charge_schedule, v_start_month, v_end_month,
        jsonb_build_object('target_kind', p_target_kind)
      );
      v_target_count := v_target_count + 1;
    end loop;
  else
    for v_target_id in
      select distinct o.id
      from public.tb810_units u
      join public.tb810_unit_types ut on ut.id = u.unit_type_id
      join public.tb810_ownerships ownership on ownership.unit_id = u.id
      join public.tb810_owners o on o.id = ownership.owner_id
      where u.building_id = v_building_id
        and u.active
        and ut.code = 'condo'
        and o.active
        and ownership.start_date <= v_start_month
        and (ownership.end_date is null or ownership.end_date >= v_start_month)
      order by o.id
    loop
      insert into public.tb810_charges (
        series_id, building_id, owner_id, description, amount, schedule,
        effective_from_month, effective_to_month, legacy_metadata
      ) values (
        v_series_id, v_building_id, v_target_id, trim(p_description), p_amount,
        p_schedule::public.tb810_charge_schedule, v_start_month, v_end_month,
        jsonb_build_object('target_kind', p_target_kind)
      );
      v_target_count := v_target_count + 1;
    end loop;
  end if;

  if v_target_count = 0 then
    raise exception 'No applicable charge targets were found.';
  end if;

  if p_dev_session_id is not null then
    insert into public.tb810_dev_test_mutations (
      session_id, domain, record_type, operation, record_identity, before_state
    ) values (
      p_dev_session_id,
      'charge'::public.tb810_dev_test_domain,
      'charge_series',
      'create',
      v_series_id::text,
      jsonb_build_object(
        'target_kind', p_target_kind,
        'target_count', v_target_count,
        'starts_month', v_start_month,
        'ends_month', v_end_month
      )
    );
  end if;

  return query select v_series_id, v_target_count, p_amount * v_target_count;
end;
$$;

revoke all on function public.tb810_create_bulk_charge(text, text, numeric, text, text, text, uuid) from public, anon, service_role;
grant execute on function public.tb810_create_bulk_charge(text, text, numeric, text, text, text, uuid) to authenticated;
