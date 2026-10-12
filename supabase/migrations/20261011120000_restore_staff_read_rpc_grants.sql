-- Make the staff read RPC grants explicit.
--
-- These SECURITY DEFINER reads never had an explicit grant; they relied on the
-- public-schema default ACL. 20261009120000_api_surface_lockdown revoked
-- PUBLIC and anon on the assumption that authenticated and service_role held
-- their own grants. That held where the defaults granted each API role
-- directly, but on a fresh migration replay the only grant was PUBLIC, so the
-- staff application (authenticated) and Pulse (service_role) lost EXECUTE.
--
-- Granting is idempotent: where these grants already exist this is a no-op.
-- anon and PUBLIC stay revoked.

grant execute on function public.tb810_get_building_month_financial_facts(uuid, integer, date)
  to authenticated, service_role;
grant execute on function public.tb810_get_unit_workspace_month_facts(uuid, uuid, integer, date)
  to authenticated, service_role;
grant execute on function public.tb810_get_unit_ownership_account_snapshot(uuid)
  to authenticated, service_role;
grant execute on function public.tb810_list_meter_reading_months(uuid)
  to authenticated, service_role;
