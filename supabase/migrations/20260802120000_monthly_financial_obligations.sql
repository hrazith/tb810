create type public.tb810_obligation_type as enum ('water_consumption', 'common_water');

create table public.tb810_monthly_financial_obligations (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  billing_period_id uuid not null references public.tb810_billing_periods(id) on delete cascade,
  obligation_type public.tb810_obligation_type not null,
  source_service_month date not null,
  amount numeric(12,2) not null,
  currency_code text not null default 'PEN',
  status text not null default 'draft',
  source_type text not null,
  source_id uuid not null,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tb810_monthly_financial_obligations_status_check
    check (status in ('draft', 'posted', 'void')),
  constraint tb810_monthly_financial_obligations_amount_check
    check (amount >= 0)
);

create unique index tb810_monthly_financial_obligations_unique_monthly_obligation
on public.tb810_monthly_financial_obligations (unit_account_id, billing_period_id, obligation_type);

create index tb810_monthly_financial_obligations_building_id_idx
on public.tb810_monthly_financial_obligations (building_id);

create index tb810_monthly_financial_obligations_unit_id_idx
on public.tb810_monthly_financial_obligations (unit_id);

create index tb810_monthly_financial_obligations_billing_period_id_idx
on public.tb810_monthly_financial_obligations (billing_period_id);

create index tb810_monthly_financial_obligations_source_id_idx
on public.tb810_monthly_financial_obligations (source_id);

drop trigger if exists tb810_monthly_financial_obligations_set_updated_at on public.tb810_monthly_financial_obligations;
create trigger tb810_monthly_financial_obligations_set_updated_at
before update on public.tb810_monthly_financial_obligations
for each row execute function public.tb810_set_updated_at();

alter table public.tb810_monthly_financial_obligations enable row level security;

create policy "tb810 staff can read monthly financial obligations"
on public.tb810_monthly_financial_obligations
for select
using (public.is_tb810_staff());

create policy "tb810 finance can manage monthly financial obligations"
on public.tb810_monthly_financial_obligations
for all
using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'))
with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
