create table public.tb810_monthly_obligations (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  billing_period_id uuid not null references public.tb810_billing_periods(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  obligation_month date not null,
  currency text not null default 'PEN',
  status text not null default 'incomplete' check (status in ('incomplete', 'complete')),
  known_total_amount numeric(12,2) not null default 0,
  snapshot_effective_at timestamptz not null,
  generated_at timestamptz,
  source_type text not null default 'monthly_assessment_snapshot',
  source_id uuid,
  snapshot_hash text not null,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_account_id, billing_period_id),
  unique (building_id, unit_account_id, obligation_month)
);

create table public.tb810_monthly_obligation_components (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  obligation_id uuid not null references public.tb810_monthly_obligations(id) on delete cascade,
  component_type text not null check (component_type in ('fixed_assessment', 'metered_water', 'common_water', 'other')),
  component_status text not null check (component_status in ('available', 'missing')),
  amount numeric(12,2),
  currency text not null default 'PEN',
  source_type text,
  source_id uuid,
  source_month date,
  source_period_id uuid references public.tb810_billing_periods(id) on delete set null,
  source_snapshot jsonb not null default '{}'::jsonb,
  missing_reason text,
  calculated_at timestamptz,
  snapshot_effective_at timestamptz not null,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obligation_id, component_type)
);

create index tb810_monthly_obligations_building_period_idx
  on public.tb810_monthly_obligations(building_id, billing_period_id);
create index tb810_monthly_obligations_unit_account_idx
  on public.tb810_monthly_obligations(unit_account_id);
create index tb810_monthly_obligation_components_obligation_idx
  on public.tb810_monthly_obligation_components(obligation_id);
create index tb810_monthly_obligation_components_unit_account_idx
  on public.tb810_monthly_obligation_components(unit_account_id);

create trigger tb810_monthly_obligations_set_updated_at
before update on public.tb810_monthly_obligations
for each row execute function public.tb810_set_updated_at();

create trigger tb810_monthly_obligation_components_set_updated_at
before update on public.tb810_monthly_obligation_components
for each row execute function public.tb810_set_updated_at();

alter table public.tb810_monthly_obligations enable row level security;
alter table public.tb810_monthly_obligation_components enable row level security;

create policy "tb810 staff can read monthly obligations"
on public.tb810_monthly_obligations
for select
using (public.is_tb810_staff());

create policy "tb810 staff manage monthly obligations"
on public.tb810_monthly_obligations
for all
using (public.has_tb810_permission('unit_accounts.manage'))
with check (public.has_tb810_permission('unit_accounts.manage'));

create policy "tb810 staff can read monthly obligation components"
on public.tb810_monthly_obligation_components
for select
using (public.is_tb810_staff());

create policy "tb810 staff manage monthly obligation components"
on public.tb810_monthly_obligation_components
for all
using (public.has_tb810_permission('unit_accounts.manage'))
with check (public.has_tb810_permission('unit_accounts.manage'));

create or replace function public.tb810_generate_monthly_obligations(
  p_building_id uuid,
  p_billing_period_id uuid,
  p_snapshot_effective_at timestamptz,
  p_unit_account_id uuid default null
)
returns table (
  obligation_id uuid,
  unit_account_id uuid,
  billing_period_id uuid,
  status text,
  known_total_amount numeric,
  snapshot_effective_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing_period record;
  v_budget_plan record;
  v_water_period record;
  v_fixed_component record;
  v_water_bill record;
  v_utility_type_id uuid;
  v_unit record;
  v_unit_account record;
  v_snapshot_hash text;
  v_obligation_id uuid;
  v_fixed_amount numeric(12,2);
  v_water_amount numeric(12,2);
  v_total_amount numeric(12,2);
  v_unit_rate numeric;
  v_meter_reading record;
begin
  select * into v_billing_period
  from public.tb810_billing_periods
  where id = p_billing_period_id
    and building_id = p_building_id;

  if not found then
    raise exception 'Billing period not found for this building';
  end if;

  select * into v_budget_plan
  from public.tb810_budget_plans
  where building_id = p_building_id
    and plan_year = v_billing_period.period_year
  order by created_at desc
  limit 1;

  select id into v_utility_type_id
  from public.tb810_utility_types
  where code = 'water';

  if v_utility_type_id is null then
    raise exception 'Water utility type is missing';
  end if;

  select * into v_water_bill
  from public.tb810_utility_bills
  where building_id = p_building_id
    and utility_type_id = v_utility_type_id
    and billing_period_id = (
      select id from public.tb810_billing_periods
      where building_id = p_building_id
        and period_year = v_billing_period.period_year
        and period_month = case when v_billing_period.period_month = 1 then 12 else v_billing_period.period_month - 1 end
        and period_year = case when v_billing_period.period_month = 1 then v_billing_period.period_year - 1 else v_billing_period.period_year end
      limit 1
    )
  order by created_at desc
  limit 1;

  if p_unit_account_id is not null then
    select ua.*, u.id as unit_id, u.participation_percentage
    into v_unit_account
    from public.tb810_unit_accounts ua
    join public.tb810_units u on u.id = ua.unit_id
    where ua.id = p_unit_account_id
      and ua.building_id = p_building_id;

    if not found then
      raise exception 'Unit account not found for this building';
    end if;

    perform 1;
  end if;

  for v_unit_account in
    select ua.*, u.id as unit_id, u.participation_percentage
    from public.tb810_unit_accounts ua
    join public.tb810_units u on u.id = ua.unit_id
    where ua.building_id = p_building_id
      and (p_unit_account_id is null or ua.id = p_unit_account_id)
      and ua.status = 'active'
  loop
    v_snapshot_hash := md5(
      coalesce(v_budget_plan.id::text, '') || '|' ||
      coalesce(v_water_bill.id::text, '') || '|' ||
      coalesce(v_unit_account.id::text, '') || '|' ||
      p_snapshot_effective_at::text
    );

    select mo.id, mo.snapshot_hash, mo.known_total_amount
    into v_obligation_id, v_snapshot_hash, v_total_amount
    from public.tb810_monthly_obligations mo
    where mo.building_id = p_building_id
      and mo.unit_account_id = v_unit_account.id
      and mo.billing_period_id = p_billing_period_id;

    if found then
      if v_snapshot_hash <> md5(
        coalesce(v_budget_plan.id::text, '') || '|' ||
        coalesce(v_water_bill.id::text, '') || '|' ||
        coalesce(v_unit_account.id::text, '') || '|' ||
        p_snapshot_effective_at::text
      ) then
        raise exception 'Monthly obligation already exists with a different snapshot';
      end if;

      continue;
    end if;

    v_fixed_amount := null;
    if v_budget_plan.id is not null then
      select round((v_budget_plan.monthly_operating_budget * (v_unit_account.participation_percentage / 100.0))::numeric, 2)
      into v_fixed_amount;
    end if;

    v_water_amount := null;
    if v_water_bill.id is not null then
      select mr.id, mr.consumption
      into v_meter_reading
      from public.tb810_meter_readings mr
      where mr.building_id = p_building_id
        and mr.unit_id = v_unit_account.unit_id
        and mr.utility_type_id = v_utility_type_id
        and mr.reading_date >= date_trunc('month', p_snapshot_effective_at)::date - interval '1 month'
      order by mr.reading_date desc, mr.created_at desc
      limit 1;

      if found and v_water_bill.amount is not null and v_water_bill.total_consumption is not null and v_water_bill.total_consumption <> 0 then
        v_unit_rate := v_water_bill.amount / v_water_bill.total_consumption;
        v_water_amount := round((coalesce(v_meter_reading.consumption, 0) * v_unit_rate)::numeric, 2);
      end if;
    end if;

    v_total_amount := coalesce(v_fixed_amount, 0) + coalesce(v_water_amount, 0);

    insert into public.tb810_monthly_obligations (
      building_id,
      billing_period_id,
      unit_id,
      unit_account_id,
      obligation_month,
      currency,
      status,
      known_total_amount,
      snapshot_effective_at,
      generated_at,
      source_type,
      source_id,
      snapshot_hash
    )
    values (
      p_building_id,
      p_billing_period_id,
      v_unit_account.unit_id,
      v_unit_account.id,
      make_date(v_billing_period.period_year, v_billing_period.period_month, 1),
      'PEN',
      case when v_fixed_amount is not null or v_water_amount is not null then 'complete' else 'incomplete' end,
      v_total_amount,
      p_snapshot_effective_at,
      case when v_fixed_amount is not null or v_water_amount is not null then now() else null end,
      'monthly_assessment_snapshot',
      v_budget_plan.id,
      md5(
        coalesce(v_budget_plan.id::text, '') || '|' ||
        coalesce(v_water_bill.id::text, '') || '|' ||
        coalesce(v_unit_account.id::text, '') || '|' ||
        p_snapshot_effective_at::text
      )
    )
    returning id into v_obligation_id;

    if v_budget_plan.id is not null then
      insert into public.tb810_monthly_obligation_components (
        building_id,
        unit_id,
        unit_account_id,
        obligation_id,
        component_type,
        component_status,
        amount,
        currency,
        source_type,
        source_id,
        source_snapshot,
        calculated_at,
        snapshot_effective_at
      )
      values (
        p_building_id,
        v_unit_account.unit_id,
        v_unit_account.id,
        v_obligation_id,
        'fixed_assessment',
        'available',
        v_fixed_amount,
        'PEN',
        'budget_plan',
        v_budget_plan.id,
        jsonb_build_object(
          'budget_plan_id', v_budget_plan.id,
          'plan_year', v_budget_plan.plan_year,
          'monthly_operating_budget', v_budget_plan.monthly_operating_budget,
          'participation_percentage', v_unit_account.participation_percentage,
          'formula', 'monthly_operating_budget * participation_percentage / 100'
        ),
        now(),
        p_snapshot_effective_at
      );
    else
      insert into public.tb810_monthly_obligation_components (
        building_id,
        unit_id,
        unit_account_id,
        obligation_id,
        component_type,
        component_status,
        currency,
        missing_reason,
        source_snapshot,
        snapshot_effective_at
      )
      values (
        p_building_id,
        v_unit_account.unit_id,
        v_unit_account.id,
        v_obligation_id,
        'fixed_assessment',
        'missing',
        'PEN',
        'Budget plan missing',
        '{}'::jsonb,
        p_snapshot_effective_at
      );
    end if;

    if v_water_bill.id is not null and v_meter_reading.id is not null then
      insert into public.tb810_monthly_obligation_components (
        building_id,
        unit_id,
        unit_account_id,
        obligation_id,
        component_type,
        component_status,
        amount,
        currency,
        source_type,
        source_id,
        source_month,
        source_period_id,
        source_snapshot,
        calculated_at,
        snapshot_effective_at
      )
      values (
        p_building_id,
        v_unit_account.unit_id,
        v_unit_account.id,
        v_obligation_id,
        'metered_water',
        'available',
        v_water_amount,
        'PEN',
        'utility_bill',
        v_water_bill.id,
        date_trunc('month', v_water_bill.bill_date)::date,
        v_water_bill.billing_period_id,
        jsonb_build_object(
          'utility_bill_id', v_water_bill.id,
          'bill_date', v_water_bill.bill_date,
          'amount', v_water_bill.amount,
          'total_consumption', v_water_bill.total_consumption,
          'meter_reading_id', v_meter_reading.id,
          'meter_reading_consumption', v_meter_reading.consumption,
          'unit_rate', v_unit_rate
        ),
        now(),
        p_snapshot_effective_at
      );
    else
      insert into public.tb810_monthly_obligation_components (
        building_id,
        unit_id,
        unit_account_id,
        obligation_id,
        component_type,
        component_status,
        currency,
        missing_reason,
        source_snapshot,
        snapshot_effective_at
      )
      values (
        p_building_id,
        v_unit_account.unit_id,
        v_unit_account.id,
        v_obligation_id,
        'metered_water',
        'missing',
        'PEN',
        'Water source unavailable',
        '{}'::jsonb,
        p_snapshot_effective_at
      );
    end if;

    insert into public.tb810_monthly_obligation_components (
      building_id,
      unit_id,
      unit_account_id,
      obligation_id,
      component_type,
      component_status,
      currency,
      missing_reason,
      source_snapshot,
      snapshot_effective_at
    )
    values (
      p_building_id,
      v_unit_account.unit_id,
      v_unit_account.id,
      v_obligation_id,
      'common_water',
      'missing',
      'PEN',
      'Common water component is out of scope',
      '{}'::jsonb,
      p_snapshot_effective_at
    );

    insert into public.tb810_monthly_obligation_components (
      building_id,
      unit_id,
      unit_account_id,
      obligation_id,
      component_type,
      component_status,
      currency,
      missing_reason,
      source_snapshot,
      snapshot_effective_at
    )
    values (
      p_building_id,
      v_unit_account.unit_id,
      v_unit_account.id,
      v_obligation_id,
      'other',
      'missing',
      'PEN',
      'Other charges are out of scope',
      '{}'::jsonb,
      p_snapshot_effective_at
    );

    return query
    select v_obligation_id, v_unit_account.id, p_billing_period_id, 'complete', v_total_amount, p_snapshot_effective_at;
  end loop;
end;
$$;
