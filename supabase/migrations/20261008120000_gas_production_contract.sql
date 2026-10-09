-- Gas production contract.
--
-- Readings: Gas source month S is consumed by Monthly Obligation package S+1
-- and follows the shared source-freeze helper (tb810_lock_source_month_open):
-- editable while S+1 is absent / draft / collecting_readings /
-- ready_for_review, frozen once S+1 is approved / invoices_generated / closed.
-- A row trigger makes this authoritative for every write path (inline edits,
-- bulk import, Start Over, DEV tools). Row-level security is enabled on
-- tb810_gas_readings, which previously had none.
--
-- Supplier purchases: package membership is explicit. A purchase is
--   available  -> not selected, not reserved, not processed
--   selected   -> selected_obligation_month = M (operator intent, reversible)
--   reserved   -> reserved_billing_period_id = package M (frozen at handoff)
--   processed  -> processed_at set when package M is approved
-- Purchase dates never assign membership. Handoff reserves exactly the
-- purchases selected for its obligation month. Lifecycle columns change only
-- through the lifecycle functions in this file (column-level REVOKE cannot
-- narrow the table-level grants Supabase gives, so a trigger enforces it).
--
-- Approval: the snapshot declares the Gas inputs it was calculated from
-- (per-unit reading and consumption, purchase IDs, pool total) and
-- persistence proves them against the database inside the package lock.

-- ---------------------------------------------------------------------------
-- Purchase provenance and explicit selection.

alter table public.tb810_gas_bills alter column invoice_number drop not null;
alter table public.tb810_gas_bills alter column supplier_name drop not null;
-- Absent provenance is NULL, never a placeholder or blank string.
alter table public.tb810_gas_bills
  add constraint tb810_gas_bills_invoice_number_present_check
  check (invoice_number is null or btrim(invoice_number) <> '');
alter table public.tb810_gas_bills
  add constraint tb810_gas_bills_supplier_name_present_check
  check (supplier_name is null or btrim(supplier_name) <> '');
alter table public.tb810_gas_bills add column if not exists selected_obligation_month date;
alter table public.tb810_gas_bills
  add constraint tb810_gas_bills_selected_month_first_day_check
  check (selected_obligation_month is null or extract(day from selected_obligation_month) = 1);
create index if not exists tb810_gas_bills_selected_month_idx
  on public.tb810_gas_bills(building_id, selected_obligation_month);

-- Lifecycle functions set this transaction-local flag before touching
-- selection, reservation or processing.
create or replace function public.tb810_gas_lifecycle_write_allowed()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('tb810.gas_lifecycle_write', true), '') = 'on'
$$;

revoke all on function public.tb810_gas_lifecycle_write_allowed() from public, anon, authenticated;

create or replace function public.tb810_guard_gas_bill_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifecycle boolean := public.tb810_gas_lifecycle_write_allowed();
begin
  if tg_op = 'INSERT' then
    if not v_lifecycle and (
      new.selected_obligation_month is not null
      or new.reserved_billing_period_id is not null
      or new.processed_at is not null
    ) then
      raise exception 'Gas purchases are created available; package selection happens separately.';
    end if;
    return new;
  end if;

  if old.processed_at is not null and not v_lifecycle then
    raise exception 'Processed Gas purchases are read-only.';
  end if;
  if old.reserved_billing_period_id is not null and not v_lifecycle then
    raise exception 'Gas purchases reserved to a Monthly Obligations package are read-only.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if not v_lifecycle and (
    new.selected_obligation_month is distinct from old.selected_obligation_month
    or new.reserved_billing_period_id is distinct from old.reserved_billing_period_id
    or new.processed_at is distinct from old.processed_at
  ) then
    raise exception 'Gas purchase selection, reservation and processing change only through the package lifecycle.';
  end if;
  if new.building_id is distinct from old.building_id then
    raise exception 'Gas purchases cannot move between buildings.';
  end if;
  return new;
end;
$$;

revoke all on function public.tb810_guard_gas_bill_lifecycle() from public, anon, authenticated;

drop trigger if exists tb810_guard_gas_bill_lifecycle on public.tb810_gas_bills;
create trigger tb810_guard_gas_bill_lifecycle
before insert or update or delete on public.tb810_gas_bills
for each row execute function public.tb810_guard_gas_bill_lifecycle();

-- Lock obligation package M's supplier pool. Shares the K6 package lock key;
-- the pool is open only until handoff (ready_for_review freezes the selection).
create or replace function public.tb810_lock_gas_pool_open(
  p_building_id uuid,
  p_obligation_month date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_obligation_month)::date;
  v_status text;
begin
  perform pg_advisory_xact_lock_shared(public.tb810_monthly_obligation_package_lock_key(
    p_building_id,
    extract(year from v_month)::integer,
    extract(month from v_month)::integer
  ));

  select bp.status into v_status
  from public.tb810_billing_periods bp
  where bp.building_id = p_building_id
    and bp.period_year = extract(year from v_month)::integer
    and bp.period_month = extract(month from v_month)::integer;

  if v_status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    raise exception 'The % Gas supplier pool is locked because the Monthly Obligations package is %.',
      to_char(v_month, 'YYYY-MM'), v_status;
  end if;
end;
$$;

revoke all on function public.tb810_lock_gas_pool_open(uuid, date) from public, anon, authenticated;

-- Select a purchase into obligation month M's pool, or pass NULL to return it
-- to the available pool. Advisory locks are taken before the purchase row
-- lock, matching handoff's order (package lock, then purchase rows).
create or replace function public.tb810_set_gas_bill_selection(
  p_bill_id uuid,
  p_obligation_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.tb810_gas_bills%rowtype;
  v_target date := case when p_obligation_month is null then null else date_trunc('month', p_obligation_month)::date end;
  v_previous date;
  v_month date;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to manage Gas supplier purchases.';
  end if;

  select * into v_bill from public.tb810_gas_bills where id = p_bill_id;
  if not found then raise exception 'Gas purchase not found.'; end if;
  v_previous := v_bill.selected_obligation_month;

  for v_month in
    select distinct m from unnest(array[v_previous, v_target]) m where m is not null order by m
  loop
    perform public.tb810_lock_gas_pool_open(v_bill.building_id, v_month);
  end loop;

  select * into v_bill from public.tb810_gas_bills where id = p_bill_id for update;
  if v_bill.selected_obligation_month is distinct from v_previous then
    raise exception 'Gas purchase selection changed; review the pool again.';
  end if;
  if v_bill.processed_at is not null then raise exception 'Processed Gas purchases are read-only.'; end if;
  if v_bill.reserved_billing_period_id is not null then
    raise exception 'Gas purchases reserved to a Monthly Obligations package are read-only.';
  end if;

  perform set_config('tb810.gas_lifecycle_write', 'on', true);
  update public.tb810_gas_bills set selected_obligation_month = v_target where id = p_bill_id;
  perform set_config('tb810.gas_lifecycle_write', '', true);

  return jsonb_build_object('id', p_bill_id, 'selectedObligationMonth', v_target);
end;
$$;

revoke all on function public.tb810_set_gas_bill_selection(uuid, date) from public, anon, service_role;
grant execute on function public.tb810_set_gas_bill_selection(uuid, date) to authenticated;

-- Handoff reserves exactly the purchases selected for this package. Unrelated
-- available purchases stay available.
create or replace function public.tb810_mark_monthly_obligation_ready_for_review_internal(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_operating_year integer,
  p_operating_month integer,
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
  v_selected_bill_ids uuid[] := '{}';
  v_requested_bill_ids uuid[] := '{}';
  v_requested_count integer := 0;
begin
  if make_date(p_period_year, p_period_month, 1) > make_date(p_operating_year, p_operating_month, 1) then
    raise exception 'Billing Period is not eligible for handoff before its obligation month.';
  end if;

  insert into public.tb810_billing_periods (building_id, period_year, period_month, starts_on, ends_on, status)
  values (p_building_id, p_period_year, p_period_month, make_date(p_period_year, p_period_month, 1),
    (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date, 'collecting_readings')
  on conflict (building_id, period_year, period_month) do nothing;

  select * into v_period from public.tb810_billing_periods
  where building_id = p_building_id and period_year = p_period_year and period_month = p_period_month
  for update;

  if v_period.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed') then
    select count(*) into v_row_count from public.tb810_monthly_financial_obligations where billing_period_id = v_period.id;
    return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'already_progressed', 'obligationRowCount', v_row_count);
  end if;
  if v_period.status not in ('draft', 'collecting_readings') then
    raise exception 'Billing Period cannot be handed off from status %.', v_period.status;
  end if;

  if p_gas_bill_ids is not null and exists (
    select 1 from unnest(p_gas_bill_ids) requested(id) where requested.id is null
  ) then
    raise exception 'Gas bill reservation cannot contain NULL IDs.';
  end if;

  perform pg_advisory_xact_lock(public.tb810_monthly_obligation_package_lock_key(p_building_id, p_period_year, p_period_month));
  select coalesce(array_agg(selected.id order by selected.id), '{}')
    into v_selected_bill_ids
  from (
    select id
    from public.tb810_gas_bills
    where building_id = p_building_id
      and selected_obligation_month = make_date(p_period_year, p_period_month, 1)
      and processed_at is null
      and reserved_billing_period_id is null
    order by id
    for update
  ) selected;

  select coalesce(array_agg(requested.id order by requested.id), '{}'), count(*)
    into v_requested_bill_ids, v_requested_count
  from unnest(coalesce(p_gas_bill_ids, '{}')) as requested(id);
  if v_requested_count <> cardinality(coalesce(p_gas_bill_ids, '{}')) then
    raise exception 'Gas bill reservation contains duplicate IDs.';
  end if;
  if v_requested_bill_ids <> v_selected_bill_ids then
    raise exception 'Gas bill set changed before handoff; review the package again.';
  end if;

  if cardinality(v_requested_bill_ids) > 0 then
    perform set_config('tb810.gas_lifecycle_write', 'on', true);
    update public.tb810_gas_bills
    set reserved_billing_period_id = v_period.id
    where building_id = p_building_id and id = any(v_requested_bill_ids);
    perform set_config('tb810.gas_lifecycle_write', '', true);
  end if;
  update public.tb810_billing_periods
  set gas_reservation_state = case when cardinality(v_requested_bill_ids) = 0 then 'native_empty' else 'native_reserved' end
  where id = v_period.id;

  update public.tb810_billing_periods set status = 'ready_for_review' where id = v_period.id;
  return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'ready_for_review', 'obligationRowCount', 0);
end;
$$;

-- Only the role-checked wrappers may call the internal handoff.
revoke all on function public.tb810_mark_monthly_obligation_ready_for_review_internal(uuid, integer, integer, integer, integer, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Readings: source freeze on every write path, and row-level security.

create or replace function public.tb810_guard_gas_reading_source_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_month date;
begin
  -- The DEV session reset restores DEV-owned facts it created.
  if coalesce(current_setting('tb810.dev_reset_gas_readings', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_building_id := case when tg_op = 'DELETE' then old.building_id else new.building_id end;
  if tg_op = 'UPDATE' and new.building_id is distinct from old.building_id then
    raise exception 'Gas readings cannot move between buildings.';
  end if;

  -- Deterministic ascending order across the origin and destination months.
  for v_month in
    select distinct m
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.reading_month end,
      case when tg_op in ('INSERT', 'UPDATE') then new.reading_month end
    ]) m
    where m is not null
    order by m
  loop
    perform public.tb810_lock_source_month_open(v_building_id, v_month, 'Gas source month');
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.tb810_guard_gas_reading_source_freeze() from public, anon, authenticated;

drop trigger if exists tb810_guard_gas_reading_source_freeze on public.tb810_gas_readings;
create trigger tb810_guard_gas_reading_source_freeze
before insert or update or delete on public.tb810_gas_readings
for each row execute function public.tb810_guard_gas_reading_source_freeze();

alter table public.tb810_gas_readings enable row level security;
drop policy if exists "tb810 staff can read gas readings" on public.tb810_gas_readings;
create policy "tb810 staff can read gas readings" on public.tb810_gas_readings
  for select using (public.is_tb810_staff());
drop policy if exists "tb810 manager manages gas readings" on public.tb810_gas_readings;
create policy "tb810 manager manages gas readings" on public.tb810_gas_readings
  for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'))
  with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));

-- Bulk import: same body as 20260927130000, plus the source-freeze check before
-- any reading of the month is read or written.
create or replace function public.tb810_sync_gas_reading_import(p_month_key text, p_rows jsonb)
returns table(inserted_count integer, updated_count integer, processed_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_month_start date;
  v_next_month_start date;
  v_expected_count integer;
  v_submitted_count integer;
  v_row jsonb;
  v_unit_id uuid;
  v_reading_date date;
  v_current_reading numeric;
  v_previous_reading numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_existing_id uuid;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to import Gas readings.';
  end if;
  if p_month_key is null or p_month_key !~ '^\d{4}-\d{2}$' then
    raise exception 'A valid target operational month is required.';
  end if;

  select id into v_building_id from public.tb810_buildings order by created_at asc limit 1;
  if v_building_id is null then raise exception 'Current building not found.'; end if;

  v_month_start := make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);
  v_next_month_start := (v_month_start + interval '1 month')::date;
  perform pg_advisory_xact_lock(hashtextextended(v_building_id::text || ':' || p_month_key, 0));

  -- Canonical source freeze, serialized against handoff/approval of S+1.
  perform public.tb810_lock_source_month_open(v_building_id, v_month_start, 'Gas source month');

  select count(*) into v_expected_count
  from public.tb810_units u
  join public.tb810_unit_types ut on ut.id = u.unit_type_id
  where u.building_id = v_building_id and ut.code = 'condo' and u.has_gas_service = true;
  v_submitted_count := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_submitted_count <> v_expected_count then
    raise exception 'Gas import must contain exactly % eligible Unit readings.', v_expected_count;
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := nullif(v_row->>'unit_id', '')::uuid;
    v_current_reading := nullif(v_row->>'current_reading', '')::numeric;
    v_reading_date := nullif(v_row->>'reading_date', '')::date;
    if v_unit_id is null or v_current_reading is null or v_reading_date is null then
      raise exception 'Every Gas reading requires a Unit, Current Reading, and Reading Date.';
    end if;
    if v_unit_id = any(v_seen) then raise exception 'Each eligible Gas Unit may appear only once.'; end if;
    v_seen := array_append(v_seen, v_unit_id);
    if not exists (
      select 1
      from public.tb810_units u
      join public.tb810_unit_types ut on ut.id = u.unit_type_id
      where u.id = v_unit_id and u.building_id = v_building_id and ut.code = 'condo' and u.has_gas_service = true
    ) then
      raise exception 'Gas import contains a non-eligible Unit.';
    end if;
    if v_reading_date < v_month_start or v_reading_date >= v_next_month_start then
      raise exception 'Reading date must belong to the selected operational month.';
    end if;
    select gr.current_reading into v_previous_reading
    from public.tb810_gas_readings gr
    where gr.building_id = v_building_id and gr.unit_id = v_unit_id and gr.reading_month < v_month_start
    order by gr.reading_month desc, gr.created_at desc limit 1;
    if v_previous_reading is not null and v_current_reading < v_previous_reading then
      raise exception 'Current reading must be greater than or equal to previous reading.';
    end if;
  end loop;

  inserted_count := 0;
  updated_count := 0;
  processed_count := 0;
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_unit_id := (v_row->>'unit_id')::uuid;
    v_reading_date := (v_row->>'reading_date')::date;
    v_current_reading := (v_row->>'current_reading')::numeric;
    select gr.current_reading into v_previous_reading
    from public.tb810_gas_readings gr
    where gr.building_id = v_building_id and gr.unit_id = v_unit_id and gr.reading_month < v_month_start
    order by gr.reading_month desc, gr.created_at desc limit 1;
    select id into v_existing_id
    from public.tb810_gas_readings
    where building_id = v_building_id and unit_id = v_unit_id and reading_month = v_month_start
    for update;

    insert into public.tb810_gas_readings (
      building_id, unit_id, reading_month, reading_date, previous_reading, current_reading,
      consumption, legacy_table, legacy_id, legacy_metadata, updated_at
    ) values (
      v_building_id, v_unit_id, v_month_start, v_reading_date, v_previous_reading, v_current_reading,
      v_current_reading - coalesce(v_previous_reading, 0), 'gas_spreadsheet', null, '{}'::jsonb, now()
    )
    on conflict (building_id, unit_id, reading_month) do update set
      reading_date = excluded.reading_date,
      previous_reading = excluded.previous_reading,
      current_reading = excluded.current_reading,
      consumption = excluded.consumption,
      legacy_table = excluded.legacy_table,
      legacy_id = excluded.legacy_id,
      legacy_metadata = excluded.legacy_metadata,
      updated_at = excluded.updated_at;
    if v_existing_id is null then inserted_count := inserted_count + 1; else updated_count := updated_count + 1; end if;
    processed_count := processed_count + 1;
  end loop;
  return query select inserted_count, updated_count, processed_count;
end;
$$;

-- Start Over: the canonical source freeze replaces the calendar-month gate.
create or replace function public.tb810_clear_current_gas_reading_month(
  p_month_key text,
  p_dev_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_month_start date;
  v_reading_ids uuid[];
  v_reading_count integer;
  v_owned_count integer;
begin
  if not (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) then
    raise exception 'You are not authorized to start over Gas readings.';
  end if;

  if p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Gas month is invalid.';
  end if;
  v_month_start := make_date(split_part(p_month_key, '-', 1)::integer, split_part(p_month_key, '-', 2)::integer, 1);

  -- A source month never runs ahead of the operating month. The database has
  -- no DEV business date, so the production clock is the upper bound.
  if v_month_start > date_trunc('month', current_date)::date then
    raise exception 'Future Gas months cannot be started over.';
  end if;

  if p_dev_session_id is not null then
    perform 1
    from public.tb810_dev_test_sessions
    where id = p_dev_session_id
      and status = 'active'
    for update;
    if not found then
      raise exception 'DEV test session not active or not found.';
    end if;
  end if;

  select id into v_building_id
  from public.tb810_buildings
  order by created_at asc
  limit 1;
  if v_building_id is null then
    raise exception 'Current building not found.';
  end if;

  -- Canonical source freeze, serialized against handoff/approval of S+1.
  perform public.tb810_lock_source_month_open(v_building_id, v_month_start, 'Gas source month');

  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_reading_ids, v_reading_count
  from public.tb810_gas_readings
  where building_id = v_building_id
    and reading_month = v_month_start;

  if p_dev_session_id is not null and v_reading_count > 0 then
    select count(*)::integer
    into v_owned_count
    from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_dev_session_id
      and mutation.domain = 'gas'::public.tb810_dev_test_domain
      and mutation.record_type = 'meter_reading'
      and mutation.operation = 'create'
      and mutation.record_identity = any(v_reading_ids::text[]);

    if v_owned_count <> v_reading_count then
      raise exception 'Start over is blocked because the current month includes readings not owned by this DEV session.';
    end if;
  end if;

  delete from public.tb810_gas_readings
  where id = any(v_reading_ids);

  if p_dev_session_id is not null and v_reading_count > 0 then
    delete from public.tb810_dev_test_mutations mutation
    where mutation.session_id = p_dev_session_id
      and mutation.domain = 'gas'::public.tb810_dev_test_domain
      and mutation.record_type = 'meter_reading'
      and mutation.operation = 'create'
      and mutation.record_identity = any(v_reading_ids::text[]);
  end if;

  return v_reading_count;
end;
$$;

revoke all on function public.tb810_clear_current_gas_reading_month(text, uuid) from public, anon, service_role;
grant execute on function public.tb810_clear_current_gas_reading_month(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Approval-time Gas provenance.
--
-- Each gas_consumption row declares calculation_snapshot.gasProvenance:
--   { sourceMonth, readingId, unitConsumption, billIds, poolTotal }
-- Persistence runs inside the exclusive package lock, where Gas source writes
-- (shared lock) cannot interleave, so the declared inputs must equal the
-- database's current Gas facts exactly.
create or replace function public.tb810_assert_gas_provenance(
  p_building_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_rows jsonb,
  p_gas_bill_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_label text := format('%s-%s', p_period_year, lpad(p_period_month::text, 2, '0'));
  v_source_month date := (make_date(p_period_year, p_period_month, 1) - interval '1 month')::date;
  v_requested uuid[];
  v_pool_total numeric;
  v_row jsonb;
  v_declared jsonb;
  v_declared_bills uuid[];
  v_gas_rows integer := 0;
begin
  select coalesce(array_agg(id order by id), '{}') into v_requested
  from (select distinct unnest(coalesce(p_gas_bill_ids, '{}')) as id) ids;
  select coalesce(sum(amount), 0) into v_pool_total
  from public.tb810_gas_bills
  where building_id = p_building_id and id = any(v_requested);

  for v_row in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
    where value->>'obligation_type' = 'gas_consumption'
  loop
    v_gas_rows := v_gas_rows + 1;
    v_declared := v_row->'calculation_snapshot'->'gasProvenance';
    if jsonb_typeof(v_declared) is distinct from 'object'
       or not (v_declared ?& array['sourceMonth', 'readingId', 'unitConsumption', 'billIds', 'poolTotal'])
       or jsonb_typeof(v_declared->'billIds') is distinct from 'array' then
      raise exception 'Gas provenance is missing from the % Monthly Obligations package.', v_month_label;
    end if;

    select coalesce(array_agg(value::uuid order by value::uuid), '{}') into v_declared_bills
    from jsonb_array_elements_text(v_declared->'billIds');

    if v_declared->>'sourceMonth' <> to_char(v_source_month, 'YYYY-MM')
       or v_declared_bills <> v_requested
       or (v_declared->>'poolTotal')::numeric <> v_pool_total
       or not exists (
         select 1
         from public.tb810_gas_readings gr
         where gr.id = (v_declared->>'readingId')::uuid
           and gr.building_id = p_building_id
           and gr.unit_id = (v_row->>'unit_id')::uuid
           and gr.reading_month = v_source_month
           and gr.consumption = (v_declared->>'unitConsumption')::numeric
       ) then
      raise exception 'Gas source changed after review for the % Monthly Obligations package.', v_month_label;
    end if;
  end loop;

  if v_gas_rows = 0 and cardinality(v_requested) > 0 then
    raise exception 'Gas provenance is missing from the % Monthly Obligations package.', v_month_label;
  end if;
end;
$$;

revoke all on function public.tb810_assert_gas_provenance(uuid, integer, integer, jsonb, uuid[]) from public, anon, authenticated;

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
  perform public.tb810_assert_gas_provenance(p_building_id, p_period_year, p_period_month, p_rows, p_gas_bill_ids);

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
    perform set_config('tb810.gas_lifecycle_write', 'on', true);
    update public.tb810_gas_bills
    set processed_at = coalesce(processed_at, timezone('utc', now()))
    where building_id = p_building_id and id = any(coalesce(p_gas_bill_ids, '{}'));
    perform set_config('tb810.gas_lifecycle_write', '', true);
  end if;

  update public.tb810_billing_periods set status = 'ready_for_review' where id = v_period.id;
  return jsonb_build_object('billingPeriodId', v_period.id, 'status', 'ready_for_review', 'obligationRowCount', v_inserted_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- DEV session reset restores DEV-owned Gas lifecycle state and readings.

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

  perform set_config('tb810.gas_lifecycle_write', 'on', true);
  perform set_config('tb810.dev_reset_gas_readings', 'on', true);

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

  perform set_config('tb810.gas_lifecycle_write', '', true);
  perform set_config('tb810.dev_reset_gas_readings', '', true);
end;
$$;
