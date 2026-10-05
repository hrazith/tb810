-- One-time DEV reconciliation for the preserved pre-K6 November 2026 package.
-- This is intentionally not a general package recalculation path.

create or replace function public.tb810_reconcile_legacy_november_package(
  p_session_id uuid,
  p_building_id uuid,
  p_billing_period_id uuid,
  p_fingerprint text,
  p_row_count integer,
  p_fixed_amount numeric,
  p_water_amount numeric,
  p_common_water_amount numeric,
  p_gas_amount numeric,
  p_total_amount numeric,
  p_gas_bill_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.tb810_dev_test_sessions%rowtype;
  v_period public.tb810_billing_periods%rowtype;
  v_available_bill_ids uuid[] := '{}';
  v_requested_bill_ids uuid[] := '{}';
  v_requested_count integer := 0;
  v_reserved_count integer := 0;
  v_before_state jsonb;
begin
  if auth.role() <> 'service_role'
     and not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'DEV reconciliation requires an authorized staff context.';
  end if;
  if p_session_id <> '875f5d5e-949a-4253-8727-a471734e6083'::uuid then
    raise exception 'This reconciliation is restricted to the audited DEV session.';
  end if;
  if p_building_id <> 'b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810'::uuid then
    raise exception 'This reconciliation is restricted to the audited building.';
  end if;
  if p_fingerprint <> 'ff5575cf92690ef8216de60b0b3b875881d6fceb1ba4087a6c51cb27c3c0833e'
     or p_row_count <> 358
     or p_fixed_amount <> 20051.80
     or p_water_amount <> 2933.99
     or p_common_water_amount <> 261.12
     or p_gas_amount <> 0.00
     or p_total_amount <> 23246.91 then
    raise exception 'November financial facts no longer match the audited reconciliation.';
  end if;
  if p_gas_bill_ids is not null and exists (
    select 1 from unnest(p_gas_bill_ids) requested(id) where requested.id is null
  ) then
    raise exception 'Gas reconciliation cannot contain NULL IDs.';
  end if;

  select * into v_session
  from public.tb810_dev_test_sessions
  where id = p_session_id and status = 'active'
  for update;
  if not found then raise exception 'DEV test session is not active or not found.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(format('%s:%s:%s', p_building_id, 2026, 11), 0));
  select * into v_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and building_id = p_building_id
    and period_year = 2026
    and period_month = 11
  for update;
  if not found then raise exception 'The audited November Billing Period was not found.'; end if;
  if v_period.status <> 'ready_for_review' or v_period.approved_at is not null or v_period.approved_by is not null then
    raise exception 'November Billing Period is no longer the audited unapproved handoff.';
  end if;
  if v_period.gas_reservation_state is not null then
    raise exception 'November Billing Period already has native Gas reservation state.';
  end if;
  if exists (select 1 from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id) then
    raise exception 'November Billing Period already has persisted obligation rows.';
  end if;
  if not exists (
    select 1
    from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_session_id
      and mutation.domain = 'obligations'::public.tb810_dev_test_domain
      and mutation.record_type = 'monthly_handoff'
      and mutation.operation = 'create'
      and mutation.record_identity = v_period.id::text
      and mutation.before_state->>'obligation_month' = '2026-11'
  ) then
    raise exception 'November Billing Period is not owned by the audited DEV handoff.';
  end if;
  select count(*) into v_reserved_count
  from public.tb810_gas_bills
  where building_id = p_building_id and reserved_billing_period_id = v_period.id;
  if v_reserved_count <> 0 then raise exception 'November already has reserved Gas bills.'; end if;

  select coalesce(array_agg(available.id order by available.id), '{}')
    into v_available_bill_ids
  from (
    select id
    from public.tb810_gas_bills
    where building_id = p_building_id and processed_at is null and reserved_billing_period_id is null
    order by id
    for update
  ) available;
  select coalesce(array_agg(requested.id order by requested.id), '{}'), count(*)
    into v_requested_bill_ids, v_requested_count
  from unnest(coalesce(p_gas_bill_ids, '{}')) as requested(id);
  if v_requested_count <> cardinality(coalesce(p_gas_bill_ids, '{}')) then
    raise exception 'Gas reconciliation contains duplicate IDs.';
  end if;
  if v_requested_bill_ids <> v_available_bill_ids then
    raise exception 'Available Gas pool changed before November reconciliation.';
  end if;
  if cardinality(v_requested_bill_ids) <> 0 then
    raise exception 'November audited reconciliation requires an empty Gas pool.';
  end if;

  v_before_state := jsonb_build_object(
    'building_id', p_building_id,
    'obligation_month', '2026-11',
    'billing_period_existed', true,
    'billing_period_before', to_jsonb(v_period),
    'preexisting_obligation_count', 0,
    'gas_reservation_before', '[]'::jsonb,
    'reconciliation_fingerprint', p_fingerprint
  );
  update public.tb810_billing_periods
  set gas_reservation_state = 'native_empty'
  where id = v_period.id and gas_reservation_state is null;
  if not found then raise exception 'November Gas reservation state changed during reconciliation.'; end if;

  insert into public.tb810_dev_test_mutations (
    session_id, domain, record_type, operation, record_identity, before_state
  ) values (
    p_session_id,
    'obligations'::public.tb810_dev_test_domain,
    'monthly_handoff',
    'update'::public.tb810_dev_test_operation,
    v_period.id::text,
    v_before_state
  );
  return jsonb_build_object(
    'billingPeriodId', v_period.id,
    'status', 'reconciled',
    'gasReservationState', 'native_empty',
    'reservedGasBillCount', 0,
    'obligationRowCount', 0
  );
end;
$$;

revoke all on function public.tb810_reconcile_legacy_november_package(uuid, uuid, uuid, text, integer, numeric, numeric, numeric, numeric, numeric, uuid[]) from public, anon;
grant execute on function public.tb810_reconcile_legacy_november_package(uuid, uuid, uuid, text, integer, numeric, numeric, numeric, numeric, numeric, uuid[]) to authenticated, service_role;
