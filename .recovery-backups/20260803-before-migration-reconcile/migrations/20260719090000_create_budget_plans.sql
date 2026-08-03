create table public.tb810_budget_plans (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  plan_year integer not null,
  currency char(3) not null default 'PEN',
  monthly_operating_budget numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, plan_year),
  constraint tb810_budget_plans_monthly_operating_budget_non_negative
    check (monthly_operating_budget >= 0)
);

alter table public.tb810_budget_plans enable row level security;

create policy "tb810 staff can read budget plans"
  on public.tb810_budget_plans
  for select
  using (public.is_tb810_staff());

create policy "tb810 building manager manages budget plans"
  on public.tb810_budget_plans
  for all
  using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'))
  with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));

create trigger tb810_budget_plans_set_updated_at
before update on public.tb810_budget_plans
for each row execute function public.tb810_set_updated_at();
