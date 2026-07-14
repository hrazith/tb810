alter table public.tb810_units
  add column registered_area_m2 numeric(12,3);

alter table public.tb810_units
  add constraint tb810_units_registered_area_m2_non_negative
  check (registered_area_m2 is null or registered_area_m2 >= 0);

alter table public.tb810_units
  rename column share_percentage to participation_percentage;

alter table public.tb810_units
  add constraint tb810_units_participation_percentage_non_negative
  check (participation_percentage >= 0);

alter table public.tb810_units
  drop column billing_adjustment_amount;
