-- One-time DEV reconciliation for the preserved pre-K6 October 2026 package.
-- This is intentionally not a general package recalculation path.

create or replace function public.tb810_reconcile_legacy_october_package(
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
  if p_fingerprint <> '5b8d0f483d1cf1c88457a0aacede0b505e07db93e2e0100a75f79d7d6e1846d4'
     or p_row_count <> 358
     or p_fixed_amount <> 20051.80
     or p_water_amount <> 3038.00
     or p_common_water_amount <> 62.08
     or p_gas_amount <> 0.00
     or p_total_amount <> 23151.88 then
    raise exception 'October financial facts no longer match the audited reconciliation.';
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

  perform pg_advisory_xact_lock(hashtextextended(format('%s:%s:%s', p_building_id, 2026, 10), 0));
  select * into v_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and building_id = p_building_id
    and period_year = 2026
    and period_month = 10
  for update;
  if not found then raise exception 'The audited October Billing Period was not found.'; end if;
  if v_period.status <> 'ready_for_review' or v_period.approved_at is not null then
    raise exception 'October Billing Period is no longer the audited unapproved handoff.';
  end if;
  if v_period.gas_reservation_state is not null then
    raise exception 'October Billing Period already has native Gas reservation state.';
  end if;
  if exists (select 1 from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id) then
    raise exception 'October Billing Period already has persisted obligation rows.';
  end if;
  if v_period.created_at >= '2026-10-04T12:00:00Z'::timestamptz then
    raise exception 'October Billing Period is not demonstrably pre-K6.';
  end if;
  select count(*) into v_reserved_count
  from public.tb810_gas_bills
  where building_id = p_building_id and reserved_billing_period_id = v_period.id;
  if v_reserved_count <> 0 then raise exception 'October already has reserved Gas bills.'; end if;

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
    raise exception 'Available Gas pool changed before October reconciliation.';
  end if;

  v_before_state := jsonb_build_object(
    'building_id', p_building_id,
    'obligation_month', '2026-10',
    'billing_period_existed', true,
    'billing_period_before', to_jsonb(v_period),
    'preexisting_obligation_count', 0,
    'gas_reservation_before', '[]'::jsonb,
    'reconciliation_fingerprint', p_fingerprint
  );
  update public.tb810_billing_periods
  set gas_reservation_state = case when cardinality(v_requested_bill_ids) = 0 then 'native_empty' else 'native_reserved' end
  where id = v_period.id and gas_reservation_state is null;
  if not found then raise exception 'October Gas reservation state changed during reconciliation.'; end if;
  if cardinality(v_requested_bill_ids) > 0 then
    update public.tb810_gas_bills
    set reserved_billing_period_id = v_period.id
    where building_id = p_building_id and id = any(v_requested_bill_ids);
  end if;
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
    'gasReservationState', case when cardinality(v_requested_bill_ids) = 0 then 'native_empty' else 'native_reserved' end,
    'reservedGasBillCount', cardinality(v_requested_bill_ids),
    'obligationRowCount', 0
  );
end;
$$;

-- Preserve the exact journaled reservation state during DEV reset. The base
-- reset predates gas_reservation_state and cannot restore this field itself.
create or replace function public.tb810_reset_dev_test_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
  v_gas_state jsonb;
begin
  perform 1 from public.tb810_dev_test_sessions where id = p_session_id and status = 'active' for update;
  if not found then raise exception 'DEV test session not active or not found'; end if;

  for mutation in
    select * from public.tb810_dev_test_mutations
    where session_id = p_session_id
      and domain = 'obligations'::public.tb810_dev_test_domain
      and record_type in ('monthly_handoff', 'monthly_snapshot')
      and operation in ('create', 'update')
    order by created_at desc, id desc
  loop
    if mutation.record_type = 'monthly_handoff' then
      for v_gas_state in select value from jsonb_array_elements(coalesce(mutation.before_state->'gas_reservation_before', '[]'::jsonb)) loop
        update public.tb810_gas_bills
        set reserved_billing_period_id = nullif(v_gas_state->>'before_reserved_billing_period_id', '')::uuid
        where id = (v_gas_state->>'id')::uuid
          and building_id = (mutation.before_state->>'building_id')::uuid
          and reserved_billing_period_id = mutation.record_identity::uuid;
      end loop;
    end if;
  end loop;

  perform public.tb810_reset_dev_test_session_base(p_session_id);

  for mutation in
    select * from public.tb810_dev_test_mutations
    where session_id = p_session_id
      and domain = 'obligations'::public.tb810_dev_test_domain
      and record_type = 'monthly_handoff'
      and operation in ('create', 'update')
    order by created_at desc, id desc
  loop
    if mutation.before_state ? 'billing_period_before' then
      update public.tb810_billing_periods
      set gas_reservation_state = mutation.before_state->'billing_period_before'->>'gas_reservation_state'
      where id = mutation.record_identity::uuid
        and building_id = (mutation.before_state->>'building_id')::uuid;
    end if;
  end loop;
end;
$$;

revoke all on function public.tb810_reconcile_legacy_october_package(uuid, uuid, uuid, text, integer, numeric, numeric, numeric, numeric, numeric, uuid[]) from public, anon;
grant execute on function public.tb810_reconcile_legacy_october_package(uuid, uuid, uuid, text, integer, numeric, numeric, numeric, numeric, numeric, uuid[]) to authenticated, service_role;
revoke all on function public.tb810_reset_dev_test_session(uuid) from public, anon;
grant execute on function public.tb810_reset_dev_test_session(uuid) to authenticated;
