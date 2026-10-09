-- Close the live API exposure found in the pre-production drift review.
--
-- These SECURITY DEFINER functions are owned by postgres and bypass RLS. The
-- public-schema default ACL granted them to PUBLIC and anon, so the publishable
-- key alone could read building financial facts, ownership history with owner
-- names, and Unit Account balances, or trigger account writes. Revoking
-- PUBLIC alone is not enough because anon holds its own direct grant.
--
-- authenticated and service_role keep EXECUTE where they already have it: the
-- staff application calls these reads, and Pulse runs the facts and
-- progression reads as service_role. Signatures match the live catalog.

revoke execute on function public.tb810_get_building_month_financial_facts(uuid, integer, date)
  from public, anon;
revoke execute on function public.tb810_get_unit_ownership_account_snapshot(uuid)
  from public, anon;
revoke execute on function public.tb810_get_unit_workspace_month_facts(uuid, uuid, integer, date)
  from public, anon;
revoke execute on function public.tb810_list_meter_reading_months(uuid)
  from public, anon;
revoke execute on function public.tb810_get_giuliana_package_progression(uuid, integer, integer)
  from public, anon;
revoke execute on function public.tb810_rebuild_unit_account_balance(uuid)
  from public, anon;
revoke execute on function public.tb810_ensure_unit_account_for_unit(uuid)
  from public, anon;

-- Pre-approval snapshot entry points. Approval now persists obligation rows
-- (tb810_approve_monthly_obligation); no application path calls these. Kept
-- for history, unreachable from every API role.
revoke all on function public.tb810_create_monthly_obligation_snapshot(uuid, integer, integer, jsonb, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.tb810_create_monthly_obligation_snapshot_system(uuid, integer, integer, jsonb, uuid[])
  from public, anon, authenticated, service_role;

-- Handoff is owned by Pulse. The staff wrapper trusts a caller-supplied
-- operating month and has no production caller, so staff get no manual
-- handoff path. The _system wrapper and its service_role grant are unchanged.
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review(uuid, integer, integer, integer, integer, uuid[])
  from public, anon, authenticated;

-- Empty, unused tables that had RLS disabled while the default ACL granted
-- anon full table privileges. RLS with no policies denies every API role.
alter table public.tb810_receipts enable row level security;
alter table public.tb810_invoice_line_items enable row level security;
