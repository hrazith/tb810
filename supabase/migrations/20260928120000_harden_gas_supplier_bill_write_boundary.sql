alter table public.tb810_gas_bills enable row level security;

create policy "tb810 staff can read gas supplier bills"
  on public.tb810_gas_bills
  for select
  using (public.is_tb810_staff());

create policy "tb810 building manager manages gas supplier bills"
  on public.tb810_gas_bills
  for all
  using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'))
  with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
