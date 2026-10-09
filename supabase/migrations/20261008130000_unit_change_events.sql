-- Unit change provenance.
--
-- tb810_units holds current Unit truth. Every edit of an existing Unit through
-- the product goes through tb810_update_unit, which updates the Unit and
-- appends ONE tb810_unit_change_events row (what changed, before, after, who,
-- when, why) in the same transaction. History is append-only.
--
-- units.manage remains super_admin only. Direct table writes (legacy import /
-- backfill scripts) are not blocked yet; blocking them is deferred hardening.

create table public.tb810_unit_change_events (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete restrict,
  unit_id uuid not null references public.tb810_units(id) on delete restrict,
  actor_user_id uuid not null,
  actor_staff_profile_id uuid not null references public.tb810_staff_profiles(id) on delete restrict,
  actor_display_name text not null,
  reason text not null check (btrim(reason) <> ''),
  -- [{ "field": <stable key>, "before": <value>, "after": <value> }, ...]
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index tb810_unit_change_events_unit_created_idx
  on public.tb810_unit_change_events(unit_id, created_at desc);

alter table public.tb810_unit_change_events enable row level security;
create policy "tb810 staff can read unit change events" on public.tb810_unit_change_events
  for select using (public.is_tb810_staff());

-- Clients read only; events are written by tb810_update_unit.
revoke all on table public.tb810_unit_change_events from public, anon, authenticated;
grant select on table public.tb810_unit_change_events to authenticated;
revoke insert, update, delete, truncate on table public.tb810_unit_change_events from service_role;
grant select on table public.tb810_unit_change_events to service_role;

create or replace function public.tb810_block_unit_change_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Unit change history is append-only.';
end;
$$;

revoke all on function public.tb810_block_unit_change_event_mutation() from public, anon, authenticated;

create trigger tb810_unit_change_events_append_only
before update or delete on public.tb810_unit_change_events
for each row execute function public.tb810_block_unit_change_event_mutation();

create trigger tb810_unit_change_events_no_truncate
before truncate on public.tb810_unit_change_events
for each statement execute function public.tb810_block_unit_change_event_mutation();

-- Canonical edit of an existing Unit. The diff is computed here against the
-- locked row; unchanged fields keep their stored value exactly.
create or replace function public.tb810_update_unit(
  p_unit_id uuid,
  p_unit_type_id uuid,
  p_unit_number text,
  p_floor text,
  p_registered_area_m2 numeric,
  p_participation_percentage numeric,
  p_has_meter boolean,
  p_has_gas_service boolean,
  p_notes text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.tb810_staff_profiles%rowtype;
  v_unit public.tb810_units%rowtype;
  v_old_type_code text;
  v_new_type_code text;
  v_unit_number text := nullif(btrim(coalesce(p_unit_number, '')), '');
  v_floor text := nullif(btrim(coalesce(p_floor, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_meter boolean;
  v_has_gas_service boolean;
  v_changes jsonb := '[]'::jsonb;
  v_event_id uuid;
begin
  if auth.uid() is null or not public.has_tb810_permission('units.manage') then
    raise exception 'You are not authorized to manage Units.';
  end if;

  select * into v_actor
  from public.tb810_staff_profiles
  where user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'You are not authorized to manage Units.';
  end if;

  select * into v_unit from public.tb810_units where id = p_unit_id for update;
  if not found then
    raise exception 'Unit not found.';
  end if;

  select code into v_new_type_code from public.tb810_unit_types where id = p_unit_type_id;
  if v_new_type_code is null then
    raise exception 'Unit type is required.';
  end if;
  select code into v_old_type_code from public.tb810_unit_types where id = v_unit.unit_type_id;

  if v_unit_number is null then
    raise exception 'Unit number is required.';
  end if;
  if p_participation_percentage is null or p_participation_percentage < 0 or p_participation_percentage > 100 then
    raise exception 'Participation percentage must be between 0 and 100.';
  end if;
  if p_registered_area_m2 is not null and p_registered_area_m2 < 0 then
    raise exception 'Registered area must be non-negative.';
  end if;

  -- Only condominium Units may have an individual Water meter or Gas service.
  v_has_meter := v_new_type_code = 'condo' and coalesce(p_has_meter, false);
  v_has_gas_service := v_new_type_code = 'condo' and coalesce(p_has_gas_service, false);

  if p_unit_type_id is distinct from v_unit.unit_type_id then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'unit_type', 'before', v_old_type_code, 'after', v_new_type_code));
  end if;
  if v_unit_number is distinct from v_unit.unit_number then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'unit_number', 'before', v_unit.unit_number, 'after', v_unit_number));
  end if;
  if v_floor is distinct from nullif(btrim(coalesce(v_unit.floor, '')), '') then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'floor', 'before', v_unit.floor, 'after', v_floor));
  end if;
  -- numeric equality ignores scale: 1.556 = 1.5560.
  if p_registered_area_m2 is distinct from v_unit.registered_area_m2 then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'registered_area_m2', 'before', v_unit.registered_area_m2, 'after', p_registered_area_m2));
  end if;
  if p_participation_percentage is distinct from v_unit.participation_percentage then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'participation_percentage', 'before', v_unit.participation_percentage, 'after', p_participation_percentage));
  end if;
  if v_has_meter is distinct from coalesce(v_unit.has_meter, false) then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'has_meter', 'before', coalesce(v_unit.has_meter, false), 'after', v_has_meter));
  end if;
  if v_has_gas_service is distinct from v_unit.has_gas_service then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'has_gas_service', 'before', v_unit.has_gas_service, 'after', v_has_gas_service));
  end if;
  if v_notes is distinct from nullif(btrim(coalesce(v_unit.notes, '')), '') then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'notes', 'before', v_unit.notes, 'after', v_notes));
  end if;

  if jsonb_array_length(v_changes) = 0 then
    return jsonb_build_object('status', 'unchanged', 'unitId', v_unit.id, 'unitNumber', v_unit.unit_number);
  end if;

  if v_reason is null then
    raise exception 'A reason for change is required.';
  end if;

  -- Fields without a meaningful change keep their stored value exactly.
  update public.tb810_units
  set unit_type_id = p_unit_type_id,
      unit_number = case when v_changes @> '[{"field":"unit_number"}]' then v_unit_number else unit_number end,
      floor = case when v_changes @> '[{"field":"floor"}]' then v_floor else floor end,
      registered_area_m2 = case when v_changes @> '[{"field":"registered_area_m2"}]' then p_registered_area_m2 else registered_area_m2 end,
      participation_percentage = case when v_changes @> '[{"field":"participation_percentage"}]' then p_participation_percentage else participation_percentage end,
      has_meter = case when v_changes @> '[{"field":"has_meter"}]' then v_has_meter else has_meter end,
      has_gas_service = case when v_changes @> '[{"field":"has_gas_service"}]' then v_has_gas_service else has_gas_service end,
      notes = case when v_changes @> '[{"field":"notes"}]' then v_notes else notes end
  where id = v_unit.id;

  insert into public.tb810_unit_change_events (
    building_id, unit_id, actor_user_id, actor_staff_profile_id, actor_display_name, reason, changes
  ) values (
    v_unit.building_id, v_unit.id, auth.uid(), v_actor.id, v_actor.display_name, v_reason, v_changes
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'status', 'updated',
    'unitId', v_unit.id,
    'unitNumber', (select unit_number from public.tb810_units where id = v_unit.id),
    'eventId', v_event_id,
    'changes', v_changes
  );
end;
$$;

revoke all on function public.tb810_update_unit(uuid, uuid, text, text, numeric, numeric, boolean, boolean, text, text) from public, anon;
grant execute on function public.tb810_update_unit(uuid, uuid, text, text, numeric, numeric, boolean, boolean, text, text) to authenticated, service_role;
