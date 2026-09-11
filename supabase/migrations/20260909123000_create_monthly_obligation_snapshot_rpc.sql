create or replace function public.tb810_create_monthly_obligation_snapshot(
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
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'Staff role cannot create Monthly Obligation snapshots.';
  end if;

  if p_period_month < 1 or p_period_month > 12 then
    raise exception 'Invalid Billing Period month.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'A complete Monthly Obligation snapshot must contain rows.';
  end if;

  insert into public.tb810_billing_periods (
    building_id,
    period_year,
    period_month,
    starts_on,
    ends_on,
    status
  ) values (
    p_building_id,
    p_period_year,
    p_period_month,
    make_date(p_period_year, p_period_month, 1),
    (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date,
    'collecting_readings'
  ) on conflict (building_id, period_year, period_month) do nothing;

  select * into v_period
  from public.tb810_billing_periods
  where building_id = p_building_id
    and period_year = p_period_year
    and period_month = p_period_month
  for update;

  if v_period.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    select count(*) into v_row_count
    from public.tb810_monthly_financial_obligations
    where billing_period_id = v_period.id;
    if v_row_count = 0 then
      raise exception 'Billing Period is marked snapshotted without persisted obligations.';
    end if;
    return jsonb_build_object(
      'billingPeriodId', v_period.id,
      'status', 'already_snapshotted',
      'obligationRowCount', v_row_count
    );
  end if;

  if v_period.status not in ('draft', 'collecting_readings') then
    raise exception 'Billing Period cannot be snapshotted from status %.', v_period.status;
  end if;

  insert into public.tb810_monthly_financial_obligations (
    building_id,
    unit_id,
    unit_account_id,
    billing_period_id,
    obligation_type,
    source_service_month,
    amount,
    currency_code,
    status,
    source_type,
    source_id,
    calculation_snapshot
  )
  select
    p_building_id,
    rows.unit_id,
    rows.unit_account_id,
    v_period.id,
    rows.obligation_type,
    rows.source_service_month,
    rows.amount,
    rows.currency_code,
    'draft',
    rows.source_type,
    rows.source_id,
    rows.calculation_snapshot
  from jsonb_to_recordset(p_rows) as rows(
    unit_id uuid,
    unit_account_id uuid,
    obligation_type public.tb810_obligation_type,
    source_service_month date,
    amount numeric(12,2),
    currency_code text,
    source_type text,
    source_id uuid,
    calculation_snapshot jsonb
  );
  get diagnostics v_inserted_count = row_count;

  if cardinality(p_gas_bill_ids) > 0 then
    if exists (
      select 1
      from public.tb810_gas_bills gb
      where gb.id = any(p_gas_bill_ids)
        and gb.building_id <> p_building_id
    ) then
      raise exception 'Gas bill provenance crosses building boundary.';
    end if;
    update public.tb810_gas_bills
    set processed_at = coalesce(processed_at, timezone('utc', now()))
    where building_id = p_building_id
      and id = any(p_gas_bill_ids);
  end if;

  update public.tb810_billing_periods
  set status = 'ready_for_review'
  where id = v_period.id;

  return jsonb_build_object(
    'billingPeriodId', v_period.id,
    'status', 'ready_for_review',
    'obligationRowCount', v_inserted_count
  );
end;
$$;
