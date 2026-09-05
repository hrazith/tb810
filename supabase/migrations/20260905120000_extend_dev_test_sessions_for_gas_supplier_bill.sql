create or replace function public.tb810_reset_dev_test_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation record;
begin
  update public.tb810_dev_test_sessions
  set status = 'resetting',
      reset_started_at = now()
  where id = p_session_id
    and status = 'active';

  if not found then
    raise exception 'DEV test session not active or not found';
  end if;

  for mutation in
    select *
    from public.tb810_dev_test_mutations
    where session_id = p_session_id
    order by created_at desc
  loop
    if mutation.domain = 'water' and mutation.record_type = 'meter_reading' and mutation.operation = 'update' then
      update public.tb810_meter_readings
      set building_id = (mutation.before_state->>'building_id')::uuid,
          unit_id = (mutation.before_state->>'unit_id')::uuid,
          utility_type_id = (mutation.before_state->>'utility_type_id')::uuid,
          reading_date = (mutation.before_state->>'reading_date')::date,
          reading_start = nullif(mutation.before_state->>'reading_start', '')::numeric,
          reading_end = nullif(mutation.before_state->>'reading_end', '')::numeric,
          consumption = nullif(mutation.before_state->>'consumption', '')::numeric,
          unit_of_measure = coalesce(mutation.before_state->>'unit_of_measure', 'm3'),
          status = mutation.before_state->>'status',
          notes = nullif(mutation.before_state->>'notes', ''),
          legacy_table = nullif(mutation.before_state->>'legacy_table', ''),
          legacy_id = nullif(mutation.before_state->>'legacy_id', ''),
          legacy_metadata = coalesce((mutation.before_state->'legacy_metadata')::jsonb, '{}'::jsonb),
          created_by = nullif(mutation.before_state->>'created_by', '')::uuid,
          updated_by = nullif(mutation.before_state->>'updated_by', '')::uuid,
          entered_by = nullif(mutation.before_state->>'entered_by', '')::uuid,
          entered_at = (mutation.before_state->>'entered_at')::timestamptz,
          created_at = (mutation.before_state->>'created_at')::timestamptz,
          updated_at = (mutation.before_state->>'updated_at')::timestamptz
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'water' and mutation.record_type = 'meter_reading' and mutation.operation = 'create' then
      delete from public.tb810_meter_readings
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'water' and mutation.record_type = 'utility_bill' and mutation.operation = 'create' then
      delete from public.tb810_utility_bills
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'gas' and mutation.record_type = 'meter_reading' and mutation.operation = 'create' then
      delete from public.tb810_gas_readings
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'gas' and mutation.record_type = 'utility_bill' and mutation.operation = 'create' then
      delete from public.tb810_gas_bills
      where id = mutation.record_identity::uuid;
    elsif mutation.domain = 'charge' and mutation.record_type = 'charge_series' and mutation.operation = 'create' then
      delete from public.tb810_charges
      where series_id = mutation.record_identity::uuid;
    end if;
  end loop;

  update public.tb810_dev_test_sessions
  set status = 'completed',
      reset_completed_at = now()
  where id = p_session_id;
end;
$$;
