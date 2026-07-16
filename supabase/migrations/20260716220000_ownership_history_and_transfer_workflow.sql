create extension if not exists btree_gist with schema public;

alter table public.tb810_ownerships
  drop column if exists billing_enabled,
  drop column if exists ownership_share;

alter table public.tb810_ownerships
  add constraint tb810_ownerships_end_date_not_before_start
    check (end_date is null or end_date >= start_date);

create unique index if not exists tb810_ownerships_one_open_per_unit_idx
  on public.tb810_ownerships (unit_id)
  where end_date is null;

alter table public.tb810_ownerships
  add constraint tb810_ownerships_no_overlapping_periods
    exclude using gist (
      unit_id with =,
      daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
    );

drop trigger if exists tb810_ownerships_sync_unit_account on public.tb810_ownerships;
drop function if exists public.tb810_sync_unit_account_for_ownership();

create or replace function public.tb810_transfer_ownership(
  p_unit_id uuid,
  p_owner_id uuid,
  p_start_date date,
  p_notes text default null
)
returns public.tb810_ownerships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit record;
  v_owner record;
  v_current_ownership record;
  v_unit_account_id uuid;
  v_new_ownership public.tb810_ownerships;
begin
  if not public.has_tb810_permission('ownerships.manage') then
    raise exception 'Not authorized to manage ownerships';
  end if;

  if p_unit_id is null then
    raise exception 'Unit is required';
  end if;

  if p_owner_id is null then
    raise exception 'Incoming owner is required';
  end if;

  if p_start_date is null then
    raise exception 'Effective date is required';
  end if;

  if extract(day from p_start_date) <> 1 then
    raise exception 'Effective date must be the first day of a month';
  end if;

  select id
  into v_unit
  from public.tb810_units
  where id = p_unit_id;

  if not found then
    raise exception 'Unit % not found', p_unit_id;
  end if;

  select id, active
  into v_owner
  from public.tb810_owners
  where id = p_owner_id;

  if not found then
    raise exception 'Incoming owner % not found', p_owner_id;
  end if;

  if not v_owner.active then
    raise exception 'Incoming owner is inactive';
  end if;

  select id, owner_id, start_date, end_date
  into v_current_ownership
  from public.tb810_ownerships
  where unit_id = p_unit_id
    and end_date is null
  order by start_date desc, created_at desc, id desc
  limit 1;

  select id
  into v_unit_account_id
  from public.tb810_unit_accounts
  where unit_id = p_unit_id
  order by created_at asc, id asc
  limit 1;

  if v_unit_account_id is null then
    raise exception 'Unit account for unit % not found', p_unit_id;
  end if;

  if v_current_ownership.id is not null then
    if v_current_ownership.owner_id = p_owner_id then
      raise exception 'Incoming owner matches the current owner';
    end if;

    if p_start_date <= v_current_ownership.start_date then
      raise exception 'Effective date must be after the current ownership start date';
    end if;

    update public.tb810_ownerships
    set end_date = p_start_date - 1
    where id = v_current_ownership.id;
  end if;

  insert into public.tb810_ownerships (
    owner_id,
    unit_id,
    start_date,
    end_date,
    notes,
    legacy_table,
    legacy_id,
    legacy_metadata
  )
  values (
    p_owner_id,
    p_unit_id,
    p_start_date,
    null,
    p_notes,
    'tb810_transfer_ownership',
    null,
    jsonb_build_object(
      'transfer_effective_date', p_start_date,
      'created_at', now(),
      'created_by', auth.uid()
    )
  )
  returning *
  into v_new_ownership;

  return v_new_ownership;
end;
$$;

grant execute on function public.tb810_transfer_ownership(uuid, uuid, date, text) to authenticated;

