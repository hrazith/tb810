# Bootstrap First Admin

Use this after the first TB810 Auth user has been invited in Supabase.

File:
- [`supabase/bootstrap-first-admin.sql`](/Users/roon/dev/tb810/supabase/bootstrap-first-admin.sql)

What it does:
- Inserts or updates the first staff profile in `tb810_staff_profiles`
- Looks up the `super_admin` role by `key = 'super_admin'`
- Inserts the `tb810_staff_roles` mapping
- Verifies the resulting staff profile and role assignment inside the same `DO` block

Schema used:
- `tb810_staff_profiles`
  - `user_id`
  - `display_name`
  - `job_title`
  - `status`
- `tb810_roles`
  - `key`
  - `name`
- `tb810_staff_roles`
  - `staff_profile_id`
  - `role_id`

Notes:
- The Auth user UUID in the SQL file is only a placeholder.
- Replace it with the real invited Auth user ID before running the script.
- The script is idempotent and can be run again safely.
- The `DO` block does not return rows, so `Success. No rows returned` is expected.
- That empty result still means the profile and role assignment checks passed.

