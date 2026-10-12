-- Audited restatement of the Gas rows of an approved Monthly Obligations package.
--
-- Approved packages are immutable history. This is the explicit, audited
-- repair path foreseen by the Gas contract for a package approved under a
-- rule later corrected: 20261012130000_gas_source_month_alignment moved the
-- Gas source month from M-1 to M, and a package approved before it bills the
-- usage of M-2.
--
-- Scope and safeguards:
-- - system execution only (service_role); never reachable from the staff app;
-- - dry run by default: every validation runs and nothing is written unless
--   p_dry_run is false;
-- - only an 'approved' package (nothing dispatched) with a native Gas
--   reservation, whose Gas rows still declare a different source month;
-- - only gas_consumption rows are replaced; every other component is untouched;
-- - the supplier pool is the one the package reserved and processed at
--   approval, and tb810_assert_gas_provenance must accept the new rows under
--   the corrected rule;
-- - every enrolled Gas Unit needs a reading for the Gas source month, so
--   missing readings stop the restatement instead of being fabricated;
-- - the previous rows are kept in the audit log and in each new row's snapshot.

create or replace function public.tb810_restate_gas_obligations_system(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
  p_reason text,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.tb810_billing_periods%rowtype;
  v_source_month date;
  v_source_label text;
  v_bill_ids uuid[];
  v_pool numeric;
  v_unprocessed integer;
  v_enrolled uuid[];
  v_row_units uuid[];
  v_missing_readings integer;
  v_previous jsonb;
  v_previous_total numeric;
  v_previous_count integer;
  v_aligned_count integer;
  v_new_total numeric;
  v_row_count integer;
  v_restated jsonb;
  v_restated_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Gas restatement requires the Supabase service role.';
  end if;
  if p_period_month is null or p_period_month < 1 or p_period_month > 12 then
    raise exception 'Invalid Billing Period month.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A Gas restatement requires a reason.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'A Gas restatement must contain rows.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where r->>'obligation_type' is distinct from 'gas_consumption'
  ) then
    raise exception 'A Gas restatement may only contain gas_consumption rows.';
  end if;

  v_source_month := make_date(p_period_year, p_period_month, 1);
  v_source_label := to_char(v_source_month, 'YYYY-MM');

  -- Same lock order as approval: the Billing Period row, then the package lock.
  select * into v_period
  from public.tb810_billing_periods
  where building_id = p_building_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;
  if not found then
    raise exception 'Billing Period not found.';
  end if;
  perform pg_advisory_xact_lock(public.tb810_monthly_obligation_package_lock_key(p_building_id, p_period_year, p_period_month));

  if v_period.status <> 'approved' then
    raise exception 'Only an approved, undispatched package can be restated; the % package is %.', v_source_label, v_period.status;
  end if;
  if v_period.gas_reservation_state is null or v_period.gas_reservation_state not in ('native_reserved', 'native_empty') then
    raise exception 'Gas restatement requires a native Gas reservation.';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'unit_id', o.unit_id,
      'amount', o.amount,
      'source_service_month', o.source_service_month,
      'calculation_snapshot', o.calculation_snapshot
    ) order by o.unit_id), '[]'::jsonb),
    coalesce(sum(o.amount), 0),
    count(*),
    count(*) filter (where o.calculation_snapshot->'gasProvenance'->>'sourceMonth' = v_source_label)
  into v_previous, v_previous_total, v_previous_count, v_aligned_count
  from public.tb810_monthly_financial_obligations o
  where o.billing_period_id = v_period.id
    and o.obligation_type = 'gas_consumption';
  if v_previous_count > 0 and v_aligned_count = v_previous_count then
    raise exception 'The % Gas rows already use the % Gas source month; nothing to restate.', v_source_label, v_source_label;
  end if;

  -- The pool is the one this package reserved and processed at approval.
  select
    coalesce(array_agg(b.id order by b.id), '{}'),
    coalesce(sum(b.amount), 0),
    count(*) filter (where b.processed_at is null)
  into v_bill_ids, v_pool, v_unprocessed
  from public.tb810_gas_bills b
  where b.building_id = p_building_id
    and b.reserved_billing_period_id = v_period.id;
  if v_unprocessed > 0 then
    raise exception 'The % Gas pool is not fully processed.', v_source_label;
  end if;

  -- Every enrolled Gas Unit needs a reading in the package's Gas source month.
  select coalesce(array_agg(u.id order by u.id), '{}')
  into v_enrolled
  from public.tb810_units u
  join public.tb810_unit_types ut on ut.id = u.unit_type_id
  where u.building_id = p_building_id
    and ut.code = 'condo'
    and u.has_gas_service = true;
  select count(*)
  into v_missing_readings
  from unnest(v_enrolled) as enrolled(unit_id)
  where not exists (
    select 1
    from public.tb810_gas_readings gr
    where gr.building_id = p_building_id
      and gr.unit_id = enrolled.unit_id
      and gr.reading_month = v_source_month
      and gr.consumption is not null
  );
  if v_missing_readings > 0 then
    raise exception 'Required gas readings are missing: % enrolled Unit(s) have no % reading.', v_missing_readings, v_source_label;
  end if;

  select coalesce(array_agg((r->>'unit_id')::uuid order by (r->>'unit_id')::uuid), '{}')
  into v_row_units
  from jsonb_array_elements(p_rows) r;
  if v_row_units is distinct from v_enrolled then
    raise exception 'A Gas restatement must contain exactly one row for every enrolled Gas Unit.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where not exists (
      select 1
      from public.tb810_unit_accounts ua
      where ua.id = (r->>'unit_account_id')::uuid
        and ua.unit_id = (r->>'unit_id')::uuid
    )
  ) then
    raise exception 'Every restated row must reference its Unit''s account.';
  end if;

  -- Provenance under the corrected Gas rule, against the processed pool.
  perform public.tb810_assert_gas_provenance(p_building_id, p_period_year, p_period_month, p_rows, v_bill_ids);

  select coalesce(sum((r->>'amount')::numeric), 0), count(*)
  into v_new_total, v_row_count
  from jsonb_array_elements(p_rows) r;
  if exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'amount')::numeric < 0) then
    raise exception 'Restated Gas amounts cannot be negative.';
  end if;
  -- Independent cent rounding leaves at most half a cent per row.
  if abs(v_new_total - v_pool) > 0.005 * v_row_count then
    raise exception 'Restated Gas total % does not reconcile to the % pool %.', v_new_total, v_source_label, v_pool;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', r->>'unit_id',
    'amount', r->>'amount',
    'gasProvenance', r->'calculation_snapshot'->'gasProvenance'
  ) order by r->>'unit_id'), '[]'::jsonb)
  into v_restated
  from jsonb_array_elements(p_rows) r;

  if p_dry_run then
    return jsonb_build_object(
      'dryRun', true,
      'billingPeriodId', v_period.id,
      'gasSourceMonth', v_source_label,
      'poolTotal', v_pool,
      'billIds', to_jsonb(v_bill_ids),
      'previousTotal', v_previous_total,
      'restatedTotal', v_new_total,
      'previousRows', v_previous,
      'restatedRows', v_restated
    );
  end if;

  delete from public.tb810_monthly_financial_obligations
  where billing_period_id = v_period.id
    and obligation_type = 'gas_consumption';

  insert into public.tb810_monthly_financial_obligations (
    building_id, unit_id, unit_account_id, billing_period_id, obligation_type, source_service_month,
    amount, currency_code, status, source_type, source_id, calculation_snapshot
  )
  select p_building_id, rows.unit_id, rows.unit_account_id, v_period.id, rows.obligation_type, rows.source_service_month,
    rows.amount, rows.currency_code, 'draft', rows.source_type, rows.source_id,
    rows.calculation_snapshot || jsonb_build_object('restatement', jsonb_build_object(
      'restatedAt', v_restated_at,
      'reason', p_reason,
      'previous', (
        select previous_row
        from jsonb_array_elements(v_previous) previous_row
        where (previous_row->>'unit_id')::uuid = rows.unit_id
        limit 1
      )
    ))
  from jsonb_to_recordset(p_rows) as rows(
    unit_id uuid, unit_account_id uuid, obligation_type public.tb810_obligation_type, source_service_month date,
    amount numeric(12,2), currency_code text, source_type text, source_id uuid, calculation_snapshot jsonb
  );

  insert into public.tb810_audit_logs (building_id, action, entity_table, entity_id, reason, metadata)
  values (
    p_building_id,
    'update',
    'tb810_monthly_financial_obligations',
    v_period.id,
    p_reason,
    jsonb_build_object(
      'kind', 'gas_restatement',
      'obligationMonth', v_source_label,
      'gasSourceMonth', v_source_label,
      'billIds', to_jsonb(v_bill_ids),
      'poolTotal', v_pool,
      'previousTotal', v_previous_total,
      'restatedTotal', v_new_total,
      'previousRows', v_previous,
      'restatedRows', v_restated,
      'restatedAt', v_restated_at
    )
  );

  perform public.tb810_assert_monthly_obligation_snapshot_integrity(p_building_id, p_period_year, p_period_month);

  return jsonb_build_object(
    'dryRun', false,
    'billingPeriodId', v_period.id,
    'gasSourceMonth', v_source_label,
    'poolTotal', v_pool,
    'previousTotal', v_previous_total,
    'restatedTotal', v_new_total,
    'restatedRowCount', v_row_count
  );
end;
$$;

revoke all on function public.tb810_restate_gas_obligations_system(uuid, integer, integer, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.tb810_restate_gas_obligations_system(uuid, integer, integer, jsonb, text, boolean)
  to service_role;
