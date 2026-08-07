create table public.tb810_gas_bills (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  supplier_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  amount numeric(12,2) not null default 0,
  notes text,
  processed_at timestamptz,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, invoice_number)
);

create table public.tb810_gas_readings (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  reading_month date not null,
  reading_date date not null,
  previous_reading numeric(12,3),
  current_reading numeric(12,3) not null,
  consumption numeric(12,3),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, unit_id, reading_month)
);

create index if not exists tb810_gas_bills_building_id_idx on public.tb810_gas_bills(building_id);
create index if not exists tb810_gas_readings_building_id_idx on public.tb810_gas_readings(building_id);
create index if not exists tb810_gas_readings_unit_id_idx on public.tb810_gas_readings(unit_id);
