alter table public.tb810_units
  add column if not exists has_gas_service boolean not null default false;
