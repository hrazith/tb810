-- TB810 first admin bootstrap.
-- Replace the placeholder Auth user UUID with the real Auth user ID
-- from the invited account before running this script.
--
-- This script is idempotent.
-- It inserts or updates the first staff profile and the super_admin role assignment,
-- then verifies both records exist.

do $$
declare
  v_auth_user_id uuid := 'e13b42e6-f99c-4584-91a9-5cb13fb1ec9d';
  v_staff_profile_id uuid;
  v_role_id uuid;
begin
  insert into public.tb810_staff_profiles (
    user_id,
    display_name,
    job_title,
    status
  )
  values (
    v_auth_user_id,
    'Harun Razith',
    'Super Admin',
    'active'
  )
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      job_title = excluded.job_title,
      status = excluded.status
  returning id into v_staff_profile_id;

  if v_staff_profile_id is null then
    select sp.id
    into v_staff_profile_id
    from public.tb810_staff_profiles sp
    where sp.user_id = v_auth_user_id;
  end if;

  select r.id
  into v_role_id
  from public.tb810_roles r
  where r.key = 'super_admin';

  if v_role_id is null then
    raise exception 'Required role super_admin was not found in tb810_roles';
  end if;

  insert into public.tb810_staff_roles (
    staff_profile_id,
    role_id
  )
  values (
    v_staff_profile_id,
    v_role_id
  )
  on conflict (staff_profile_id, role_id) do nothing;

  if not exists (
    select 1
    from public.tb810_staff_profiles sp
    where sp.id = v_staff_profile_id
      and sp.user_id = v_auth_user_id
      and sp.display_name = 'Harun Razith'
      and sp.job_title = 'Super Administrator'
      and sp.status = 'active'
  ) then
    raise exception 'TB810 staff profile verification failed';
  end if;

  if not exists (
    select 1
    from public.tb810_staff_roles sr
    where sr.staff_profile_id = v_staff_profile_id
      and sr.role_id = v_role_id
  ) then
    raise exception 'TB810 super_admin role assignment verification failed';
  end if;
end;
$$;

