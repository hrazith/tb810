alter table public.tb810_units
  add column if not exists display_order integer not null default 0;

alter table public.tb810_units
  drop constraint if exists tb810_units_display_order_non_negative;

alter table public.tb810_units
  add constraint tb810_units_display_order_non_negative
  check (display_order >= 0);

with ordered_units as (
  select
    u.id,
    row_number() over (
      partition by u.building_id
      order by ut.sort_order asc, u.unit_number asc, u.id asc
    ) - 1 as display_order
  from public.tb810_units u
  join public.tb810_unit_types ut on ut.id = u.unit_type_id
)
update public.tb810_units u
set display_order = ordered_units.display_order
from ordered_units
where ordered_units.id = u.id;

create index if not exists tb810_units_building_display_order_idx
  on public.tb810_units(building_id, display_order, unit_number);
