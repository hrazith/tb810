alter table public.tb810_meter_readings
  add column if not exists reading_month date generated always as (make_date(extract(year from reading_date)::int, extract(month from reading_date)::int, 1)) stored;

create unique index if not exists tb810_meter_readings_month_identity_idx
  on public.tb810_meter_readings (building_id, unit_id, utility_type_id, reading_month);
