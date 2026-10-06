-- Sedapal / Common Water source-freeze contract.
--
-- Common Water source period S is consumed by Monthly Obligation package S+1.
--   S+1 absent / draft / collecting_readings / ready_for_review -> editable
--   S+1 approved / invoices_generated / closed                  -> frozen
--
-- Source mutations and Carlos approval serialize on the K6 package advisory
-- lock key (the same key the K6 handoff takes): source writes take it SHARED
-- for every consuming package they touch; approval and snapshot persistence
-- take it EXCLUSIVELY for the package being approved. Freeze status is read
-- only after the locks are held.
--
-- Approval additionally proves that the Sedapal facts declared in the
-- obligation rows (calculation_snapshot.sedapalBill) are exactly the Common
-- Water bill that exists when approval commits.
--
-- Supersedes the drifted live trigger function, which rejected every UPDATE,
-- and restores the missing BEFORE DELETE trigger.

-- K6 package lock key. Must stay identical to the expression used by
-- tb810_mark_monthly_obligation_ready_for_review_internal.
create or replace function public.tb810_monthly_obligation_package_lock_key(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer
)
returns bigint
language sql
immutable
set search_path = public
as $$
  select hashtextextended(format('%s:%s:%s', p_building_id, p_period_year, p_period_month), 0)
$$;

revoke all on function public.tb810_monthly_obligation_package_lock_key(uuid, integer, integer) from public, anon, authenticated;

-- Lock and assert that every consuming package of the given Common Water
-- source periods is still open.
create or replace function public.tb810_lock_common_water_source_periods(
  p_building_id uuid,
  p_source_period_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consuming record;
  v_status text;
begin
  if exists (select 1 from unnest(coalesce(p_source_period_ids, '{}')) requested(id) where requested.id is null) then
    raise exception 'Common water bills must remain attached to a source Billing Period.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_source_period_ids, '{}')) requested(id)
    left join public.tb810_billing_periods bp
      on bp.id = requested.id
     and bp.building_id = p_building_id
    where bp.id is null
  ) then
    raise exception 'Common water source Billing Period was not found for this building.';
  end if;

  -- Deterministic ascending order; shared locks never conflict with each other.
  for v_consuming in
    select distinct consuming.consuming_month
    from (
      select (make_date(bp.period_year, bp.period_month, 1) + interval '1 month')::date as consuming_month
      from public.tb810_billing_periods bp
      where bp.building_id = p_building_id
        and bp.id = any(p_source_period_ids)
    ) consuming
    order by consuming.consuming_month
  loop
    perform pg_advisory_xact_lock_shared(public.tb810_monthly_obligation_package_lock_key(
      p_building_id,
      extract(year from v_consuming.consuming_month)::integer,
      extract(month from v_consuming.consuming_month)::integer
    ));
  end loop;

  -- Status is read only after every lock is held (new statement snapshot).
  for v_consuming in
    select distinct consuming.consuming_month
    from (
      select (make_date(bp.period_year, bp.period_month, 1) + interval '1 month')::date as consuming_month
      from public.tb810_billing_periods bp
      where bp.building_id = p_building_id
        and bp.id = any(p_source_period_ids)
    ) consuming
    order by consuming.consuming_month
  loop
    v_status := null;
    select bp.status into v_status
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from v_consuming.consuming_month)::integer
      and bp.period_month = extract(month from v_consuming.consuming_month)::integer;

    if v_status in ('approved', 'invoices_generated', 'closed') then
      raise exception 'This Sedapal source is locked because the % Monthly Obligations package is %.',
        to_char(v_consuming.consuming_month, 'YYYY-MM'), v_status;
    end if;
  end loop;
end;
$$;

revoke all on function public.tb810_lock_common_water_source_periods(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.tb810_sync_common_water_utility_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_common_water_type_id uuid;
  v_period public.tb810_billing_periods%rowtype;
begin
  select id into v_common_water_type_id
  from public.tb810_utility_types
  where code = 'common_water'
  limit 1;

  if tg_op = 'INSERT' then
    if new.current_reading is null or new.previous_reading is null then
      raise exception 'Current and previous readings are required';
    end if;

    if new.current_reading <= new.previous_reading then
      raise exception 'Current reading must be greater than previous reading';
    end if;

    if new.amount <= 0 then
      raise exception 'Common water bill amount must be positive';
    end if;

    if new.utility_type_id is not distinct from v_common_water_type_id then
      if new.billing_period_id is null then
        raise exception 'Common water bills must remain attached to a source Billing Period.';
      end if;

      -- Take the foreign-key row lock before the package advisory locks so
      -- every path locks billing-period rows first, like approval and handoff.
      select * into v_period
      from public.tb810_billing_periods
      where id = new.billing_period_id
        and building_id = new.building_id
      for key share;
      if not found then
        raise exception 'Common water source Billing Period was not found for this building.';
      end if;
      if date_trunc('month', new.bill_date)::date <> make_date(v_period.period_year, v_period.period_month, 1) then
        raise exception 'Reading date must belong to the source Billing Period month.';
      end if;

      perform public.tb810_lock_common_water_source_periods(new.building_id, array[new.billing_period_id]);
    end if;

    new.total_consumption := new.current_reading - new.previous_reading;
    new.unit_cost := round(new.amount / new.total_consumption, 4);
    return new;
  end if;

  -- Non-Common Water utility bills keep their existing immutable behaviour.
  if old.utility_type_id is distinct from v_common_water_type_id then
    raise exception 'Common water bills are immutable';
  end if;

  if new.building_id is distinct from old.building_id then
    raise exception 'Building is read-only';
  end if;

  if new.utility_type_id is distinct from old.utility_type_id then
    raise exception 'Utility type is read-only';
  end if;

  if new.previous_reading is distinct from old.previous_reading then
    raise exception 'Previous reading is read-only';
  end if;

  if new.billing_period_id is null then
    raise exception 'Common water bills must remain attached to a source Billing Period.';
  end if;

  -- Foreign-key row lock first (see INSERT), then the package advisory locks.
  select * into v_period
  from public.tb810_billing_periods
  where id = new.billing_period_id
    and building_id = new.building_id
  for key share;
  if not found then
    raise exception 'Common water source Billing Period was not found for this building.';
  end if;
  if date_trunc('month', new.bill_date)::date <> make_date(v_period.period_year, v_period.period_month, 1) then
    raise exception 'Reading date must belong to the source Billing Period month.';
  end if;

  -- Protect both the original and destination consuming packages.
  perform public.tb810_lock_common_water_source_periods(
    old.building_id,
    array_remove(array[old.billing_period_id, new.billing_period_id], null)
  );

  if new.current_reading is null or new.amount is null then
    raise exception 'Current reading and amount are required';
  end if;

  if new.amount <= 0 then
    raise exception 'Common water bill amount must be positive';
  end if;

  if new.current_reading <= old.previous_reading then
    raise exception 'Current reading must be greater than previous reading';
  end if;

  new.previous_reading := old.previous_reading;
  new.total_consumption := new.current_reading - old.previous_reading;
  new.unit_cost := round(new.amount / new.total_consumption, 4);

  return new;
end;
$$;

drop trigger if exists tb810_utility_bills_sync_common_water on public.tb810_utility_bills;
create trigger tb810_utility_bills_sync_common_water
before insert or update on public.tb810_utility_bills
for each row execute function public.tb810_sync_common_water_utility_bill();

-- DELETE stays blocked. The existing DEV reset GUC remains the only path, and
-- it must still respect the consuming-package freeze.
create or replace function public.tb810_block_common_water_bill_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('tb810.dev_common_water_reset_bill_id', true) = old.id::text then
    perform public.tb810_lock_common_water_source_periods(
      old.building_id,
      array_remove(array[old.billing_period_id], null)
    );
    return old;
  end if;

  raise exception 'Common water bills are immutable';
end;
$$;

drop trigger if exists tb810_utility_bills_block_delete on public.tb810_utility_bills;
create trigger tb810_utility_bills_block_delete
before delete on public.tb810_utility_bills
for each row execute function public.tb810_block_common_water_bill_changes();

-- Prove that the submitted Sedapal provenance is the Common Water bill that
-- currently feeds the package. Callers must hold the exclusive package lock.
create or replace function public.tb810_assert_sedapal_provenance(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package text := format('%s-%s', p_period_year, lpad(p_period_month::text, 2, '0'));
  v_source_month date := (make_date(p_period_year, p_period_month, 1) - interval '1 month')::date;
  v_source_period_id uuid;
  v_bill_count integer;
  v_bill public.tb810_utility_bills%rowtype;
  v_dependent_count integer;
  v_declared_count integer;
begin
  select bp.id into v_source_period_id
  from public.tb810_billing_periods bp
  where bp.building_id = p_building_id
    and bp.period_year = extract(year from v_source_month)::integer
    and bp.period_month = extract(month from v_source_month)::integer;
  if v_source_period_id is null then
    raise exception 'Sedapal source bill is missing for the % Monthly Obligations package.', v_package;
  end if;

  select count(*) into v_bill_count
  from public.tb810_utility_bills b
  where b.building_id = p_building_id
    and b.billing_period_id = v_source_period_id
    and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1);
  if v_bill_count = 0 then
    raise exception 'Sedapal source bill is missing for the % Monthly Obligations package.', v_package;
  end if;
  if v_bill_count > 1 then
    raise exception 'Sedapal source is ambiguous for the % Monthly Obligations package: % Common Water bills are attached.', v_package, v_bill_count;
  end if;

  select b.* into v_bill
  from public.tb810_utility_bills b
  where b.building_id = p_building_id
    and b.billing_period_id = v_source_period_id
    and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1);

  select
    count(*) filter (where row_value->>'obligation_type' in ('common_water', 'water_consumption')),
    count(*) filter (
      where row_value->>'obligation_type' in ('common_water', 'water_consumption')
        and jsonb_typeof(row_value->'calculation_snapshot'->'sedapalBill') = 'object'
        and (row_value->'calculation_snapshot'->'sedapalBill') ?& array['id', 'billingPeriodId', 'amount', 'previousReading', 'currentReading', 'totalConsumption']
    )
  into v_dependent_count, v_declared_count
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as rows(row_value);

  if v_dependent_count = 0 or v_declared_count <> v_dependent_count then
    raise exception 'Sedapal provenance is missing from the % Monthly Obligations package.', v_package;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as rows(row_value)
    cross join lateral (select row_value->'calculation_snapshot'->'sedapalBill' as declared) d
    where row_value->>'obligation_type' in ('common_water', 'water_consumption')
      -- CASE guarantees the numeric casts only run on validated text.
      and not coalesce(
        case
          when d.declared->>'id' = v_bill.id::text
            and d.declared->>'billingPeriodId' = v_bill.billing_period_id::text
            and (d.declared->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (d.declared->>'previousReading') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (d.declared->>'currentReading') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (d.declared->>'totalConsumption') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (d.declared->>'amount')::numeric = v_bill.amount
            and (d.declared->>'previousReading')::numeric = v_bill.previous_reading
            and (d.declared->>'currentReading')::numeric = v_bill.current_reading
            and (d.declared->>'totalConsumption')::numeric = v_bill.total_consumption
          else false
        end,
        false
      )
  ) then
    raise exception 'Sedapal source changed after review for the % Monthly Obligations package.', v_package;
  end if;
end;
$$;

revoke all on function public.tb810_assert_sedapal_provenance(uuid, integer, integer, jsonb) from public, anon, authenticated;

-- Canonical persistence: unchanged except for the exclusive package lock and
-- the Sedapal provenance assertion before any row insert or Gas consumption.
create or replace function public.tb810_persist_monthly_obligation_snapshot(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
  p_gas_bill_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.tb810_billing_periods%rowtype;
  v_row_count integer;
  v_inserted_count integer;
begin
  if p_period_month < 1 or p_period_month > 12 then raise exception 'Invalid Billing Period month.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'A complete Monthly Obligation snapshot must contain rows.'; end if;
  insert into public.tb810_billing_periods (building_id, period_year, period_month, starts_on, ends_on, status)
  values (p_building_id, p_period_year, p_period_month, make_date(p_period_year, p_period_month, 1), (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date, 'collecting_readings')
  on conflict (building_id, period_year, period_month) do nothing;
  select * into v_period from public.tb810_billing_periods
  where building_id = p_building_id and period_year = p_period_year and period_month = p_period_month
  for update;
  perform pg_advisory_xact_lock(public.tb810_monthly_obligation_package_lock_key(p_building_id, p_period_year, p_period_month));
  if v_period.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    select count(*) into v_row_count from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id;
    if v_row_count = 0 then raise exception 'Billing Period is marked snapshotted without persisted obligations.'; end if;
    return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'already_snapshotted', 'obligationRowCount', v_row_count);
  end if;
  if v_period.status not in ('draft', 'collecting_readings') then raise exception 'Billing Period cannot be snapshotted from status %.', v_period.status; end if;

  perform public.tb810_assert_sedapal_provenance(p_building_id, p_period_year, p_period_month, p_rows);

  insert into public.tb810_monthly_financial_obligations (
    building_id, unit_id, unit_account_id, billing_period_id, obligation_type, source_service_month,
    amount, currency_code, status, source_type, source_id, calculation_snapshot
  )
  select p_building_id, rows.unit_id, rows.unit_account_id, v_period.id, rows.obligation_type, rows.source_service_month,
    rows.amount, rows.currency_code, 'draft', rows.source_type, rows.source_id, rows.calculation_snapshot
  from jsonb_to_recordset(p_rows) as rows(
    unit_id uuid, unit_account_id uuid, obligation_type public.tb810_obligation_type, source_service_month date,
    amount numeric(12,2), currency_code text, source_type text, source_id uuid, calculation_snapshot jsonb
  );
  get diagnostics v_inserted_count = row_count;

  if cardinality(coalesce(p_gas_bill_ids, '{}')) > 0 or v_period.gas_reservation_state is not null then
    perform public.tb810_assert_gas_bill_reservation(v_period.id, p_building_id, p_gas_bill_ids);
    update public.tb810_gas_bills
    set processed_at = coalesce(processed_at, timezone('utc', now()))
    where building_id = p_building_id and id = any(coalesce(p_gas_bill_ids, '{}'));
  end if;

  update public.tb810_billing_periods set status = 'ready_for_review' where id = v_period.id;
  return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'ready_for_review', 'obligationRowCount', v_inserted_count);
end;
$$;

-- Carlos approval: unchanged lifecycle, plus the exclusive package lock after
-- the existing row lock, and provenance for the existing-rows branch.
create or replace function public.tb810_approve_monthly_obligation(
  p_billing_period_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
  p_gas_bill_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.tb810_billing_periods%rowtype;
  v_row_count integer;
  v_persisted jsonb;
  v_existing_rows jsonb;
begin
  if not public.has_tb810_role('super_admin') then
    raise exception 'Only an authorized financial administrator can approve Monthly Obligations.';
  end if;

  select * into v_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;
  if not found then
    raise exception 'Billing Period not found.';
  end if;
  perform pg_advisory_xact_lock(public.tb810_monthly_obligation_package_lock_key(v_period.building_id, p_period_year, p_period_month));
  if v_period.status = 'approved' then
    return jsonb_build_object('status', 'approved');
  end if;
  if v_period.status <> 'ready_for_review' then
    raise exception 'Billing Period cannot be approved from status %.', v_period.status;
  end if;

  select count(*) into v_row_count
  from public.tb810_monthly_financial_obligations
  where billing_period_id = v_period.id;

  if v_row_count = 0 then
    update public.tb810_billing_periods
    set status = 'collecting_readings'
    where id = v_period.id;
    v_persisted := public.tb810_persist_monthly_obligation_snapshot(
      v_period.building_id,
      p_period_year,
      p_period_month,
      p_rows,
      p_gas_bill_ids
    );
    if v_persisted->>'status' <> 'ready_for_review' then
      raise exception 'Monthly Obligation snapshot could not be created.';
    end if;
  else
    -- Previously persisted rows must prove the same Sedapal provenance.
    select coalesce(jsonb_agg(jsonb_build_object(
      'obligation_type', o.obligation_type,
      'calculation_snapshot', o.calculation_snapshot
    )), '[]'::jsonb)
    into v_existing_rows
    from public.tb810_monthly_financial_obligations o
    where o.billing_period_id = v_period.id;
    perform public.tb810_assert_sedapal_provenance(v_period.building_id, p_period_year, p_period_month, v_existing_rows);
  end if;

  update public.tb810_billing_periods
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = timezone('utc', now())
  where id = v_period.id
    and status = 'ready_for_review';
  if not found then
    raise exception 'Billing Period changed before approval.';
  end if;

  return jsonb_build_object('status', 'approved');
end;
$$;

create or replace function public.tb810_approve_dev_monthly_obligation(
  p_session_id uuid,
  p_billing_period_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
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
  v_gas_before jsonb := '[]'::jsonb;
  v_gas_after jsonb := '[]'::jsonb;
  v_persisted jsonb;
  v_row_count integer;
begin
  if not public.has_tb810_role('super_admin') then
    raise exception 'Only an authorized financial administrator can approve Monthly Obligations.';
  end if;

  select * into v_session
  from public.tb810_dev_test_sessions
  where id = p_session_id and status = 'active'
  for update;
  if not found then
    raise exception 'DEV test session not active or not found.';
  end if;

  select * into v_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;
  if not found then
    raise exception 'Billing Period not found.';
  end if;
  perform pg_advisory_xact_lock(public.tb810_monthly_obligation_package_lock_key(v_period.building_id, p_period_year, p_period_month));
  select count(*) into v_row_count
  from public.tb810_monthly_financial_obligations
  where billing_period_id = v_period.id;
  if v_row_count <> 0 then
    raise exception 'DEV approval requires a Billing Period with zero existing obligation rows.';
  end if;
  if v_period.status <> 'ready_for_review' then
    raise exception 'Billing Period cannot be approved from status %.', v_period.status;
  end if;

  if cardinality(p_gas_bill_ids) > 0 then
    perform 1
    from public.tb810_gas_bills
    where building_id = v_period.building_id and id = any(p_gas_bill_ids)
    for update;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'before_processed_at', processed_at) order by id), '[]'::jsonb)
    into v_gas_before
    from public.tb810_gas_bills
    where building_id = v_period.building_id and id = any(p_gas_bill_ids);
  end if;

  update public.tb810_billing_periods
  set status = 'collecting_readings'
  where id = v_period.id;
  v_persisted := public.tb810_persist_monthly_obligation_snapshot(
    v_period.building_id, p_period_year, p_period_month, p_rows, p_gas_bill_ids
  );
  if v_persisted->>'status' <> 'ready_for_review' then
    raise exception 'Monthly Obligation snapshot could not be created.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gb.id,
    'before_processed_at', state.value->'before_processed_at',
    'after_processed_at', gb.processed_at
  ) order by gb.id), '[]'::jsonb)
  into v_gas_after
  from public.tb810_gas_bills gb
  join jsonb_array_elements(v_gas_before) state on state.value->>'id' = gb.id::text
  where gb.building_id = v_period.building_id and gb.id = any(p_gas_bill_ids);

  insert into public.tb810_dev_test_mutations (
    session_id, domain, record_type, operation, record_identity, before_state
  ) values (
    p_session_id, 'obligations'::public.tb810_dev_test_domain, 'monthly_snapshot', 'create',
    v_period.id::text,
    jsonb_build_object(
      'building_id', v_period.building_id,
      'obligation_month', format('%s-%s', p_period_year, lpad(p_period_month::text, 2, '0')),
      'billing_period_existed', true,
      'billing_period_before', to_jsonb(v_period),
      'preexisting_obligation_count', 0,
      'created_obligation_count', (v_persisted->>'obligationRowCount')::integer,
      'gas_supplier_bills', v_gas_after
    )
  );

  update public.tb810_billing_periods
  set status = 'approved', approved_by = auth.uid(), approved_at = timezone('utc', now())
  where id = v_period.id and status = 'ready_for_review';
  if not found then
    raise exception 'Billing Period changed before approval.';
  end if;
  return jsonb_build_object('status', 'approved');
end;
$$;
