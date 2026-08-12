create type public.tb810_charge_schedule as enum ('one_off', 'recurring');

create table public.tb810_charges (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_id uuid references public.tb810_units(id) on delete cascade,
  owner_id uuid references public.tb810_owners(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  schedule public.tb810_charge_schedule not null default 'one_off',
  effective_from_month date not null,
  effective_to_month date,
  stop_note text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tb810_charges_amount_non_zero check (amount <> 0),
  constraint tb810_charges_exactly_one_target check (
    (unit_id is not null and owner_id is null)
    or (unit_id is null and owner_id is not null)
  ),
  constraint tb810_charges_one_off_range check (
    (schedule = 'one_off' and effective_to_month is null)
    or schedule = 'recurring'
  ),
  constraint tb810_charges_range_check check (
    effective_to_month is null or effective_to_month >= effective_from_month
  )
);

create unique index tb810_charges_series_start_unique
on public.tb810_charges (series_id, effective_from_month);

create index tb810_charges_building_id_idx
on public.tb810_charges (building_id);

create index tb810_charges_unit_id_idx
on public.tb810_charges (unit_id);

create index tb810_charges_owner_id_idx
on public.tb810_charges (owner_id);

create index tb810_charges_effective_from_month_idx
on public.tb810_charges (effective_from_month);

create index tb810_charges_effective_to_month_idx
on public.tb810_charges (effective_to_month);

drop trigger if exists tb810_charges_set_updated_at on public.tb810_charges;
create trigger tb810_charges_set_updated_at
before update on public.tb810_charges
for each row execute function public.tb810_set_updated_at();

alter table public.tb810_charges enable row level security;

create policy "tb810 staff can read charges"
on public.tb810_charges
for select
using (public.is_tb810_staff());

create policy "tb810 finance can manage charges"
on public.tb810_charges
for all
using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'))
with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
