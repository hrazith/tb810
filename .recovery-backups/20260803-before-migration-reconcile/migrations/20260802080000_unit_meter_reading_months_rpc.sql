create or replace function public.tb810_list_meter_reading_months(
  p_building_id uuid
)
returns table (
  reading_month date
)
language sql
security definer
set search_path = public
as $$
  select distinct mr.reading_month
  from public.tb810_meter_readings mr
  where mr.building_id = p_building_id
  order by mr.reading_month desc
$$;

