-- Allow only the DEV reset function to remove an explicitly owned Common Water bill.
create or replace function public.tb810_block_common_water_bill_changes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('tb810.dev_common_water_reset_bill_id', true) = old.id::text then
    return old;
  end if;

  raise exception 'Common water bills are immutable';
end;
$$;

create or replace function public.tb810_create_dev_common_water_bill_with_document(
  p_session_id uuid,
  p_bill_id uuid,
  p_building_id uuid,
  p_utility_type_id uuid,
  p_billing_period_id uuid,
  p_bill_date date,
  p_amount numeric,
  p_description text,
  p_notes text,
  p_previous_reading numeric,
  p_current_reading numeric,
  p_total_consumption numeric,
  p_unit_cost numeric,
  p_storage_bucket text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_bill_id uuid;
  v_document_id uuid;
begin
  if not exists (
    select 1
    from public.tb810_dev_test_sessions
    where id = p_session_id and status = 'active'
    for update
  ) then
    raise exception 'DEV test session not active or not found.';
  end if;

  v_result := public.tb810_create_common_water_bill_with_document(
    p_bill_id,
    p_building_id,
    p_utility_type_id,
    p_billing_period_id,
    p_bill_date,
    p_amount,
    p_description,
    p_notes,
    p_previous_reading,
    p_current_reading,
    p_total_consumption,
    p_unit_cost,
    p_storage_bucket,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_metadata
  );

  v_bill_id := (v_result->'bill'->>'id')::uuid;
  v_document_id := (v_result->'document'->>'id')::uuid;

  insert into public.tb810_dev_test_mutations (
    session_id,
    domain,
    record_type,
    operation,
    record_identity,
    before_state
  ) values (
    p_session_id,
    'water',
    'utility_bill',
    'create',
    v_bill_id::text,
    jsonb_build_object(
      'document_id', v_document_id,
      'storage_bucket', p_storage_bucket,
      'storage_path', p_storage_path
    )
  );

  return v_result;
end;
$$;

revoke all on function public.tb810_create_dev_common_water_bill_with_document(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, bigint, jsonb
) from public, anon;
grant execute on function public.tb810_create_dev_common_water_bill_with_document(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, bigint, jsonb
) to authenticated;

create or replace function public.tb810_reset_dev_test_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
  snapshot_period public.tb810_billing_periods%rowtype;
  snapshot_state jsonb;
  gas_state jsonb;
  expected_obligation_count integer;
  actual_obligation_count integer;
  before_processed_at timestamptz;
  after_processed_at timestamptz;
  current_processed_at timestamptz;
begin
  update public.tb810_dev_test_sessions
  set status = 'resetting', reset_started_at = now()
  where id = p_session_id and status = 'active';
  if not found then
    raise exception 'DEV test session not active or not found';
  end if;

  for mutation in
    select * from public.tb810_dev_test_mutations
    where session_id = p_session_id order by created_at desc
  loop
    if mutation.domain::text = 'obligations' and mutation.record_type = 'monthly_snapshot' and mutation.operation = 'create' then
      snapshot_state := mutation.before_state;
      if coalesce((snapshot_state->>'preexisting_obligation_count')::integer, -1) <> 0 then
        raise exception 'DEV snapshot ownership record is not reversible.';
      end if;
      select * into snapshot_period from public.tb810_billing_periods
      where id = mutation.record_identity::uuid for update;
      if not found then raise exception 'DEV snapshot Billing Period no longer exists.'; end if;
      if snapshot_period.building_id::text <> snapshot_state->>'building_id'
        or format('%s-%s', snapshot_period.period_year, lpad(snapshot_period.period_month::text, 2, '0')) <> snapshot_state->>'obligation_month' then
        raise exception 'DEV snapshot Billing Period identity changed.';
      end if;
      if snapshot_period.status <> 'ready_for_review' or snapshot_period.approved_by is not null or snapshot_period.approved_at is not null then
        raise exception 'DEV snapshot reset requires an unapproved ready_for_review Billing Period.';
      end if;
      expected_obligation_count := (snapshot_state->>'created_obligation_count')::integer;
      select count(*) into actual_obligation_count from public.tb810_monthly_financial_obligations
      where billing_period_id = snapshot_period.id and building_id = snapshot_period.building_id;
      if actual_obligation_count <> expected_obligation_count then
        raise exception 'DEV snapshot obligation rows changed after creation.';
      end if;
      for gas_state in select value from jsonb_array_elements(snapshot_state->'gas_supplier_bills') loop
        before_processed_at := nullif(gas_state->>'before_processed_at', '')::timestamptz;
        after_processed_at := nullif(gas_state->>'after_processed_at', '')::timestamptz;
        select processed_at into current_processed_at from public.tb810_gas_bills
        where id = (gas_state->>'id')::uuid and building_id = snapshot_period.building_id;
        if not found or current_processed_at is distinct from after_processed_at then
          raise exception 'DEV snapshot Gas supplier bill state changed after creation.';
        end if;
      end loop;
    end if;
  end loop;

  for mutation in
    select * from public.tb810_dev_test_mutations
    where session_id = p_session_id order by created_at desc
  loop
    if mutation.domain::text = 'obligations' and mutation.record_type = 'monthly_snapshot' and mutation.operation = 'create' then
      snapshot_state := mutation.before_state;
      for gas_state in select value from jsonb_array_elements(snapshot_state->'gas_supplier_bills') loop
        update public.tb810_gas_bills
        set processed_at = nullif(gas_state->>'before_processed_at', '')::timestamptz
        where id = (gas_state->>'id')::uuid and building_id = (snapshot_state->>'building_id')::uuid;
      end loop;
      delete from public.tb810_monthly_financial_obligations
      where billing_period_id = mutation.record_identity::uuid and building_id = (snapshot_state->>'building_id')::uuid;
      if coalesce((snapshot_state->>'billing_period_existed')::boolean, false) then
        snapshot_state := snapshot_state->'billing_period_before';
        update public.tb810_billing_periods
        set building_id = (snapshot_state->>'building_id')::uuid, period_year = (snapshot_state->>'period_year')::integer,
            period_month = (snapshot_state->>'period_month')::integer, starts_on = (snapshot_state->>'starts_on')::date,
            ends_on = (snapshot_state->>'ends_on')::date, status = snapshot_state->>'status',
            approved_by = nullif(snapshot_state->>'approved_by', '')::uuid, approved_at = nullif(snapshot_state->>'approved_at', '')::timestamptz,
            approval_notes = snapshot_state->>'approval_notes', notes = snapshot_state->>'notes',
            legacy_table = snapshot_state->>'legacy_table', legacy_id = snapshot_state->>'legacy_id',
            legacy_metadata = coalesce((snapshot_state->'legacy_metadata')::jsonb, '{}'::jsonb),
            created_at = (snapshot_state->>'created_at')::timestamptz, updated_at = (snapshot_state->>'updated_at')::timestamptz
        where id = mutation.record_identity::uuid;
      else
        delete from public.tb810_billing_periods where id = mutation.record_identity::uuid
          and status = 'ready_for_review' and approved_by is null and approved_at is null;
        if not found then raise exception 'DEV-created Billing Period changed before reset.'; end if;
      end if;
    elsif mutation.domain = 'water' and mutation.record_type = 'meter_reading' and mutation.operation = 'update' then
      update public.tb810_meter_readings
      set building_id = (mutation.before_state->>'building_id')::uuid, unit_id = (mutation.before_state->>'unit_id')::uuid,
          utility_type_id = (mutation.before_state->>'utility_type_id')::uuid, reading_date = (mutation.before_state->>'reading_date')::date,
          reading_start = nullif(mutation.before_state->>'reading_start', '')::numeric, consumption = nullif(mutation.before_state->>'consumption', '')::numeric,
          reading_end = nullif(mutation.before_state->>'reading_end', '')::numeric, unit_of_measure = coalesce(mutation.before_state->>'unit_of_measure', 'm3'),
          status = mutation.before_state->>'status', notes = mutation.before_state->>'notes', legacy_table = nullif(mutation.before_state->>'legacy_table', ''),
          legacy_id = nullif(mutation.before_state->>'legacy_id', ''), legacy_metadata = coalesce((mutation.before_state->'legacy_metadata')::jsonb, '{}'::jsonb),
          created_by = nullif(mutation.before_state->>'created_by', '')::uuid, updated_by = nullif(mutation.before_state->>'updated_by', '')::uuid,
          entered_by = nullif(mutation.before_state->>'entered_by', '')::uuid, entered_at = (mutation.before_state->>'entered_at')::timestamptz,
          created_at = (mutation.before_state->>'created_at')::timestamptz, updated_at = (mutation.before_state->>'updated_at')::timestamptz
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'water' and mutation.record_type = 'meter_reading' and mutation.operation = 'create' then
      delete from public.tb810_meter_readings where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'water' and mutation.record_type = 'utility_bill' and mutation.operation = 'create' then
      if mutation.before_state ? 'document_id' then
        delete from public.tb810_documents
        where id = (mutation.before_state->>'document_id')::uuid
          and utility_bill_id = mutation.record_identity::uuid;
      end if;
      perform set_config('tb810.dev_common_water_reset_bill_id', mutation.record_identity::text, true);
      delete from public.tb810_utility_bills where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'gas' and mutation.record_type = 'meter_reading' and mutation.operation = 'create' then
      delete from public.tb810_gas_readings where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'gas' and mutation.record_type = 'utility_bill' and mutation.operation = 'create' then
      delete from public.tb810_gas_bills where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'charge' and mutation.record_type = 'charge_series' and mutation.operation = 'create' then
      delete from public.tb810_charges where series_id = mutation.record_identity::uuid;
    end if;
  end loop;

  update public.tb810_dev_test_sessions set status = 'completed', reset_completed_at = now()
  where id = p_session_id;
end;
$$;
