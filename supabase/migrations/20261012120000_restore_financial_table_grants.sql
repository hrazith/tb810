-- Make the financial table grants explicit.
--
-- 20260711190000_create_tb810_schema granted the API roles access with
-- `grant ... on all tables in schema public`, which covers only the tables
-- that existed at that point. Every financial table created afterwards relied
-- on the public-schema default ACL. Where the defaults granted the API roles
-- table access directly, that worked; on a fresh migration replay the
-- defaults grant only TRUNCATE, REFERENCES, TRIGGER and MAINTAIN, so the staff
-- application (authenticated) and Pulse (service_role) cannot read these
-- tables. Same class of gap as 20261011120000_restore_staff_read_rpc_grants.
--
-- Grants are the minimum the application uses; RLS still decides which rows
-- each staff role reaches (staff read, building_manager/super_admin write).
-- Every RPC that writes these tables is SECURITY DEFINER and needs no caller
-- grant. Granting is idempotent: where these grants already exist this is a
-- no-op. Nothing is revoked here.

-- Budget Plans: read everywhere; upsertBudgetPlan inserts or updates; never deleted.
grant select, insert, update on table public.tb810_budget_plans to authenticated;
-- Pulse (system handoff) reads the plan in getSnapshotCalculation.
grant select on table public.tb810_budget_plans to service_role;

-- Unit Charges: create, edit, stop and delete future charges.
grant select, insert, update, delete on table public.tb810_charges to authenticated;

-- Gas: purchases and readings are created, corrected and deleted from the Gas
-- workspaces. Lifecycle fields and frozen source months stay protected by
-- tb810_guard_gas_bill_lifecycle and tb810_guard_gas_reading_source_freeze.
grant select, insert, update, delete on table public.tb810_gas_bills to authenticated;
grant select, insert, update, delete on table public.tb810_gas_readings to authenticated;

-- Monthly Obligations are read only. Rows are written solely by the SECURITY
-- DEFINER approval/snapshot RPCs, so no client write grant is given.
grant select on table public.tb810_monthly_financial_obligations to authenticated;
