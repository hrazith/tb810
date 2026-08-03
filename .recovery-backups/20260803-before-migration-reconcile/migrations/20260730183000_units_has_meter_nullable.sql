alter table public.tb810_units
  alter column has_meter drop not null;

alter table public.tb810_units
  alter column has_meter drop default;
