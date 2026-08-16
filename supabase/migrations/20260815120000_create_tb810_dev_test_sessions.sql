create type public.tb810_dev_test_domain as enum ('water', 'charge');
create type public.tb810_dev_test_operation as enum ('create', 'update');
create type public.tb810_dev_test_session_status as enum ('active', 'resetting', 'completed');

create table public.tb810_dev_test_sessions (
  id uuid primary key default gen_random_uuid(),
  status public.tb810_dev_test_session_status not null default 'active',
  started_at timestamptz not null default now(),
  reset_started_at timestamptz,
  reset_completed_at timestamptz
);

create table public.tb810_dev_test_mutations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tb810_dev_test_sessions(id) on delete cascade,
  domain public.tb810_dev_test_domain not null,
  record_type text not null,
  operation public.tb810_dev_test_operation not null,
  record_identity text not null,
  before_state jsonb,
  created_at timestamptz not null default now(),
  constraint tb810_dev_test_mutations_unique_first_state unique (session_id, domain, record_type, operation, record_identity)
);

create index tb810_dev_test_mutations_session_id_idx
on public.tb810_dev_test_mutations (session_id);

create index tb810_dev_test_mutations_record_identity_idx
on public.tb810_dev_test_mutations (record_identity);

alter table public.tb810_dev_test_sessions enable row level security;
alter table public.tb810_dev_test_mutations enable row level security;

create policy "tb810 staff can read dev test sessions"
on public.tb810_dev_test_sessions
for select
using (public.is_tb810_staff());

create policy "tb810 staff can manage dev test sessions"
on public.tb810_dev_test_sessions
for all
using (public.is_tb810_staff())
with check (public.is_tb810_staff());

create policy "tb810 staff can read dev test mutations"
on public.tb810_dev_test_mutations
for select
using (public.is_tb810_staff());

create policy "tb810 staff can manage dev test mutations"
on public.tb810_dev_test_mutations
for all
using (public.is_tb810_staff())
with check (public.is_tb810_staff());

create or replace function public.tb810_reset_dev_test_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
begin
  update public.tb810_dev_test_sessions
  set status = 'resetting',
      reset_started_at = now()
  where id = p_session_id
    and status = 'active';

  if not found then
    raise exception 'DEV test session not active or not found';
  end if;

  for mutation in
    select *
    from public.tb810_dev_test_mutations
    where session_id = p_session_id
    order by created_at desc
  loop
    if mutation.domain = 'water' and mutation.record_type = 'meter_reading' and mutation.operation = 'update' then
      update public.tb810_meter_readings
      set building_id = (mutation.before_state->>'building_id')::uuid,
          unit_id = (mutation.before_state->>'unit_id')::uuid,
          utility_type_id = (mutation.before_state->>'utility_type_id')::uuid,
          reading_date = (mutation.before_state->>'reading_date')::date,
          reading_start = nullif(mutation.before_state->>'reading_start', '')::numeric,
          reading_end = nullif(mutation.before_state->>'reading_end', '')::numeric,
          consumption = nullif(mutation.before_state->>'consumption', '')::numeric,
          unit_of_measure = coalesce(mutation.before_state->>'unit_of_measure', 'm3'),
          status = mutation.before_state->>'status',
          notes = nullif(mutation.before_state->>'notes', ''),
          legacy_table = nullif(mutation.before_state->>'legacy_table', ''),
          legacy_id = nullif(mutation.before_state->>'legacy_id', ''),
          legacy_metadata = coalesce((mutation.before_state->'legacy_metadata')::jsonb, '{}'::jsonb),
          created_by = nullif(mutation.before_state->>'created_by', '')::uuid,
          updated_by = nullif(mutation.before_state->>'updated_by', '')::uuid,
          entered_by = nullif(mutation.before_state->>'entered_by', '')::uuid,
          entered_at = (mutation.before_state->>'entered_at')::timestamptz,
          created_at = (mutation.before_state->>'created_at')::timestamptz,
          updated_at = (mutation.before_state->>'updated_at')::timestamptz
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'water' and mutation.record_type = 'meter_reading' and mutation.operation = 'create' then
      delete from public.tb810_meter_readings
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'charge' and mutation.record_type = 'charge_series' and mutation.operation = 'create' then
      delete from public.tb810_charges
      where series_id = mutation.record_identity::uuid;
    end if;
  end loop;

  update public.tb810_dev_test_sessions
  set status = 'completed',
      reset_completed_at = now()
  where id = p_session_id;
end;
$$;
