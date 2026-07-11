-- TB810 bootstrap seed.
-- Safe to run multiple times.
-- The first staff profile and `super_admin` assignment are intentionally not seeded here.
-- After the first Auth user is invited, create the matching `tb810_staff_profiles` row
-- and assign the `super_admin` role in a separate bootstrap step.

insert into public.tb810_buildings (
  id,
  name,
  legal_name,
  address,
  notes,
  legacy_table,
  legacy_id,
  legacy_metadata
)
values (
  'b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810',
  'TB810',
  'TB810',
  null,
  'Standalone TB810 bootstrap building record.',
  'tb810_bootstrap',
  'default_building',
  jsonb_build_object('seed', true, 'scope', 'tb810')
)
on conflict (id) do update
set name = excluded.name,
    legal_name = excluded.legal_name,
    address = excluded.address,
    notes = excluded.notes,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id,
    legacy_metadata = excluded.legacy_metadata;

insert into public.tb810_unit_types (
  id,
  code,
  name,
  sort_order,
  legacy_table,
  legacy_id,
  legacy_metadata
)
values
  ('c2bc6a40-7d8e-4d1d-8c8b-8a1a76f3e001', 'condo', 'Condo', 1, 'tb810_bootstrap', 'unit_type_condo', jsonb_build_object('seed', true)),
  ('c2bc6a40-7d8e-4d1d-8c8b-8a1a76f3e002', 'parking', 'Parking', 2, 'tb810_bootstrap', 'unit_type_parking', jsonb_build_object('seed', true)),
  ('c2bc6a40-7d8e-4d1d-8c8b-8a1a76f3e003', 'storage', 'Storage', 3, 'tb810_bootstrap', 'unit_type_storage', jsonb_build_object('seed', true))
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id,
    legacy_metadata = excluded.legacy_metadata;

insert into public.tb810_utility_types (
  id,
  code,
  name,
  active,
  legacy_table,
  legacy_id,
  legacy_metadata
)
values
  ('d3a37e20-7d8e-4d1d-8c8b-8a1a76f3e001', 'water', 'Water', true, 'tb810_bootstrap', 'utility_type_water', jsonb_build_object('seed', true)),
  ('d3a37e20-7d8e-4d1d-8c8b-8a1a76f3e002', 'common_water', 'Common Water', true, 'tb810_bootstrap', 'utility_type_common_water', jsonb_build_object('seed', true)),
  ('d3a37e20-7d8e-4d1d-8c8b-8a1a76f3e003', 'common_electricity', 'Common Electricity', true, 'tb810_bootstrap', 'utility_type_common_electricity', jsonb_build_object('seed', true))
on conflict (code) do update
set name = excluded.name,
    active = excluded.active,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id,
    legacy_metadata = excluded.legacy_metadata;

insert into public.tb810_roles (
  id,
  key,
  name,
  description,
  legacy_table,
  legacy_id,
  legacy_metadata
)
values
  ('e4a5a9c0-7d8e-4d1d-8c8b-8a1a76f3e001', 'super_admin', 'Super Admin', 'Full TB810 administrative access.', 'tb810_bootstrap', 'role_super_admin', jsonb_build_object('seed', true)),
  ('e4a5a9c0-7d8e-4d1d-8c8b-8a1a76f3e002', 'building_manager', 'Building Manager', 'Manages building operations and billing workflows.', 'tb810_bootstrap', 'role_building_manager', jsonb_build_object('seed', true)),
  ('e4a5a9c0-7d8e-4d1d-8c8b-8a1a76f3e003', 'reconciliation_specialist', 'Reconciliation Specialist', 'Handles payment and transaction reconciliation.', 'tb810_bootstrap', 'role_reconciliation_specialist', jsonb_build_object('seed', true)),
  ('e4a5a9c0-7d8e-4d1d-8c8b-8a1a76f3e004', 'building_staff', 'Building Staff', 'Staff role for operational access.', 'tb810_bootstrap', 'role_building_staff', jsonb_build_object('seed', true)),
  ('e4a5a9c0-7d8e-4d1d-8c8b-8a1a76f3e005', 'viewer', 'Viewer', 'Read-only access role.', 'tb810_bootstrap', 'role_viewer', jsonb_build_object('seed', true))
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id,
    legacy_metadata = excluded.legacy_metadata;

insert into public.tb810_permissions (
  id,
  key,
  name,
  description,
  legacy_table,
  legacy_id,
  legacy_metadata
)
values
  ('f5b6bac0-7d8e-4d1d-8c8b-8a1a76f3e001', 'units.manage', 'Manage Units', 'Create, update, and delete units.', 'tb810_bootstrap', 'permission_units_manage', jsonb_build_object('seed', true)),
  ('f5b6bac0-7d8e-4d1d-8c8b-8a1a76f3e002', 'owners.manage', 'Manage Owners', 'Create, update, and delete owners.', 'tb810_bootstrap', 'permission_owners_manage', jsonb_build_object('seed', true)),
  ('f5b6bac0-7d8e-4d1d-8c8b-8a1a76f3e003', 'unit_accounts.manage', 'Manage Unit Accounts', 'Create, update, and delete unit accounts.', 'tb810_bootstrap', 'permission_unit_accounts_manage', jsonb_build_object('seed', true))
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id,
    legacy_metadata = excluded.legacy_metadata;

-- Permission mappings for the current TB810 RLS model.
-- `super_admin` gets the explicit permissions used by policy checks.
-- Other roles are intentionally left without permission mappings here.
insert into public.tb810_role_permissions (
  role_id,
  permission_id
)
select r.id, p.id
from public.tb810_roles r
join public.tb810_permissions p on p.key in ('units.manage', 'owners.manage', 'unit_accounts.manage')
where r.key = 'super_admin'
on conflict (role_id, permission_id) do nothing;
