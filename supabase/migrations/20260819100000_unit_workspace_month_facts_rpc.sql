create or replace function public.tb810_get_unit_workspace_month_facts(
  p_building_id uuid,
  p_unit_id uuid,
  p_plan_year integer,
  p_reading_month date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with plan as (
    select bp.currency, bp.monthly_operating_budget
    from public.tb810_budget_plans bp
    where bp.building_id = p_building_id
      and bp.plan_year = p_plan_year
    limit 1
  ),
  charges as (
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb) as rows
    from public.tb810_charges c
    where c.building_id = p_building_id
      and c.unit_id = p_unit_id
  ),
  bills as (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.bill_date desc, b.created_at desc), '[]'::jsonb) as rows
    from public.tb810_utility_bills b
    where b.building_id = p_building_id
  ),
  common_water_bill as (
    select to_jsonb(b) as row
    from public.tb810_utility_bills b
    join public.tb810_billing_periods bp on bp.id = b.billing_period_id
    where b.building_id = p_building_id
      and b.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1)
      and bp.period_year = extract(year from p_reading_month)::integer
      and bp.period_month = extract(month from p_reading_month)::integer
    limit 1
  ),
  readings as (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.unit_id), '[]'::jsonb) as rows
    from public.tb810_meter_readings r
    where r.building_id = p_building_id
      and r.utility_type_id = (select id from public.tb810_utility_types where code = 'common_water' limit 1)
      and r.reading_month = p_reading_month
  ),
  common_water_type as (
    select to_jsonb(ut) as row
    from public.tb810_utility_types ut
    where ut.code = 'common_water'
    limit 1
  ),
  gas_bills as (
    select coalesce(jsonb_agg(to_jsonb(gb) order by gb.invoice_date desc, gb.created_at desc), '[]'::jsonb) as rows
    from public.tb810_gas_bills gb
    where gb.building_id = p_building_id
  ),
  gas_readings as (
    select coalesce(jsonb_agg(to_jsonb(gr) order by gr.reading_month desc, gr.created_at desc), '[]'::jsonb) as rows
    from public.tb810_gas_readings gr
    where gr.building_id = p_building_id
      and gr.reading_month = p_reading_month
  ),
  units as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'unit_type_id', u.unit_type_id,
      'unit_type_code', ut.code,
      'unit_number', u.unit_number,
      'has_gas_service', u.has_gas_service,
      'has_meter', u.has_meter
    ) order by u.display_order, u.unit_number), '[]'::jsonb) as rows
    from public.tb810_units u
    join public.tb810_unit_types ut on ut.id = u.unit_type_id
    where u.building_id = p_building_id
  )
  select jsonb_build_object(
    'plan', (select to_jsonb(plan) from plan),
    'charges', (select rows from charges),
    'bills', (select rows from bills),
    'commonWaterBill', (select row from common_water_bill),
    'readings', (select rows from readings),
    'commonWaterType', (select row from common_water_type),
    'gasBills', (select rows from gas_bills),
    'gasReadings', (select rows from gas_readings),
    'unitRows', (select rows from units)
  )
$$;
