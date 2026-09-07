create or replace function public.tb810_get_building_month_financial_facts(
  p_building_id uuid,
  p_plan_year integer,
  p_reading_month date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with reading_months as (
    select
      p_reading_month as current_reading_month,
      (p_reading_month + interval '1 month')::date as upcoming_reading_month,
      (p_reading_month + interval '1 month')::date as current_obligation_month,
      (p_reading_month + interval '2 months')::date as upcoming_obligation_month
  ),
  current_plan as (
    select bp.currency, bp.monthly_operating_budget
    from public.tb810_budget_plans bp
    where bp.building_id = p_building_id
      and bp.plan_year = p_plan_year
    limit 1
  ),
  upcoming_plan as (
    select bp.currency, bp.monthly_operating_budget
    from public.tb810_budget_plans bp
    where bp.building_id = p_building_id
      and bp.plan_year = extract(year from (select upcoming_obligation_month from reading_months))::integer
    limit 1
  ),
  common_water_type as (
    select to_jsonb(ut) as row
    from public.tb810_utility_types ut
    where ut.code = 'common_water'
    limit 1
  ),
  current_billing_period as (
    select bp.id
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select current_reading_month from reading_months))::integer
      and bp.period_month = extract(month from (select current_reading_month from reading_months))::integer
    limit 1
  ),
  upcoming_billing_period as (
    select bp.id
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.period_year = extract(year from (select upcoming_reading_month from reading_months))::integer
      and bp.period_month = extract(month from (select upcoming_reading_month from reading_months))::integer
    limit 1
  ),
  current_common_water_bill as (
    select to_jsonb(b) as row
    from public.tb810_utility_bills b
    join current_billing_period bp on bp.id = b.billing_period_id
    where b.building_id = p_building_id
      and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1)
    limit 1
  ),
  upcoming_common_water_bill as (
    select to_jsonb(b) as row
    from public.tb810_utility_bills b
    join upcoming_billing_period bp on bp.id = b.billing_period_id
    where b.building_id = p_building_id
      and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1)
    limit 1
  ),
  unit_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'unit_number', u.unit_number,
      'unit_type_id', u.unit_type_id,
      'unit_type_code', ut.code,
      'has_meter', u.has_meter,
      'has_gas_service', u.has_gas_service,
      'participation_percentage', u.participation_percentage
    ) order by u.display_order, u.unit_number), '[]'::jsonb) as rows
    from public.tb810_units u
    join public.tb810_unit_types ut on ut.id = u.unit_type_id
    where u.building_id = p_building_id
  ),
  current_water_readings as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'unit_id', r.unit_id,
      'reading_end', r.reading_end,
      'consumption', r.consumption,
      'reading_date', r.reading_date,
      'created_at', r.created_at
    ) order by r.created_at, r.unit_id), '[]'::jsonb) as rows
    from public.tb810_meter_readings r
    where r.building_id = p_building_id
      and r.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1)
      and r.reading_month = (select current_reading_month from reading_months)
  ),
  upcoming_water_readings as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'unit_id', r.unit_id,
      'reading_end', r.reading_end,
      'consumption', r.consumption,
      'reading_date', r.reading_date,
      'created_at', r.created_at
    ) order by r.created_at, r.unit_id), '[]'::jsonb) as rows
    from public.tb810_meter_readings r
    where r.building_id = p_building_id
      and r.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1)
      and r.reading_month = (select upcoming_reading_month from reading_months)
  ),
  gas_bills as (
    select coalesce(jsonb_agg(to_jsonb(gb) order by gb.invoice_date desc, gb.created_at desc), '[]'::jsonb) as rows
    from public.tb810_gas_bills gb
    where gb.building_id = p_building_id
  ),
  current_gas_readings as (
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows
    from public.tb810_gas_readings gr
    where gr.building_id = p_building_id
      and gr.reading_month = (select current_reading_month from reading_months)
  ),
  upcoming_gas_readings as (
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows
    from public.tb810_gas_readings gr
    where gr.building_id = p_building_id
      and gr.reading_month = (select upcoming_reading_month from reading_months)
  ),
  charges as (
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb) as rows
    from public.tb810_charges c
    where c.building_id = p_building_id
  )
  select jsonb_build_object(
    'currentPlan', (select to_jsonb(current_plan) from current_plan),
    'upcomingPlan', (select to_jsonb(upcoming_plan) from upcoming_plan),
    'commonWaterType', (select row from common_water_type),
    'unitRows', (select rows from unit_rows),
    'gasBills', (select rows from gas_bills),
    'charges', (select rows from charges),
    'current', jsonb_build_object(
      'commonWaterBill', (select row from current_common_water_bill),
      'waterReadings', (select rows from current_water_readings),
      'gasReadings', (select rows from current_gas_readings)
    ),
    'upcoming', jsonb_build_object(
      'commonWaterBill', (select row from upcoming_common_water_bill),
      'waterReadings', (select rows from upcoming_water_readings),
      'gasReadings', (select rows from upcoming_gas_readings)
    )
  )
$$;
