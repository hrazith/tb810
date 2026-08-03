insert into public.tb810_permissions (
  id,
  key,
  name,
  description,
  legacy_table,
  legacy_id,
  legacy_metadata
)
values (
  'f5b6bac0-7d8e-4d1d-8c8b-8a1a76f3e004',
  'ownerships.manage',
  'Manage Ownerships',
  'Create, update, and transfer ownership records.',
  'tb810_bootstrap',
  'permission_ownerships_manage',
  jsonb_build_object('seed', true)
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id,
    legacy_metadata = excluded.legacy_metadata;

insert into public.tb810_role_permissions (
  role_id,
  permission_id
)
select r.id, p.id
from public.tb810_roles r
join public.tb810_permissions p on p.key = 'ownerships.manage'
where r.key = 'super_admin'
on conflict (role_id, permission_id) do nothing;
