-- Read-only preflight for scripts/restate-gas-obligations.mjs.
-- One SELECT; change the month in `params` (first day of the obligation month).
-- Every row is a check: status 'PASS', 'STOP' or 'INFO', with its evidence.
with params as (
  select date '2026-10-01' as package_month
),
building as (
  select id from public.tb810_buildings order by created_at asc limit 1
),
package as (
  select bp.*
  from public.tb810_billing_periods bp, params p, building b
  where bp.building_id = b.id
    and bp.period_year = extract(year from p.package_month)::integer
    and bp.period_month = extract(month from p.package_month)::integer
),
previous_package as (
  select bp.*
  from public.tb810_billing_periods bp, params p, building b
  where bp.building_id = b.id
    and make_date(bp.period_year, bp.period_month, 1) = (p.package_month - interval '1 month')::date
),
next_package as (
  select bp.*
  from public.tb810_billing_periods bp, params p, building b
  where bp.building_id = b.id
    and make_date(bp.period_year, bp.period_month, 1) = (p.package_month + interval '1 month')::date
),
enrolled as (
  select u.id, u.unit_number
  from public.tb810_units u
  join public.tb810_unit_types ut on ut.id = u.unit_type_id, building b
  where u.building_id = b.id and ut.code = 'condo' and u.has_gas_service
),
readings as (
  select gr.*, e.unit_number
  from public.tb810_gas_readings gr
  join enrolled e on e.id = gr.unit_id, params p
  where gr.reading_month between (p.package_month - interval '3 months')::date and p.package_month
),
medians as (
  select r.unit_id, percentile_cont(0.5) within group (order by r.consumption) as median_consumption
  from readings r
  group by r.unit_id
),
chain as (
  select r.unit_number, r.reading_month, r.previous_reading, r.current_reading, r.consumption,
    lag(r.current_reading) over (partition by r.unit_id order by r.reading_month) as prior_current,
    m.median_consumption
  from readings r
  join medians m on m.unit_id = r.unit_id
),
package_gas_rows as (
  select o.*
  from public.tb810_monthly_financial_obligations o
  join package pk on pk.id = o.billing_period_id
  where o.obligation_type = 'gas_consumption'
)
select 1 as step, 'package status' as "check",
  case when pk.status = 'approved' and pk.gas_reservation_state in ('native_reserved', 'native_empty') then 'PASS' else 'STOP' end as status,
  jsonb_build_object('status', pk.status, 'gas_reservation_state', pk.gas_reservation_state, 'approved_at', pk.approved_at) as evidence
from package pk
union all
select 2, 'package exists', 'STOP', jsonb_build_object('reason', 'no Billing Period for the package month')
where not exists (select 1 from package)
union all
select 3, 'Gas rows still use the previous source month',
  case when count(*) > 0 and count(*) filter (where o.calculation_snapshot->'gasProvenance'->>'sourceMonth' = to_char((select package_month from params), 'YYYY-MM')) = 0 then 'PASS' else 'STOP' end,
  jsonb_build_object('rows', count(*), 'total', sum(o.amount),
    'declared_source_months', coalesce(jsonb_agg(distinct o.calculation_snapshot->'gasProvenance'->>'sourceMonth'), '[]'::jsonb))
from package_gas_rows o
union all
select 4, 'reading for every enrolled Gas Unit in the package month',
  case when count(*) filter (where gr.id is null or gr.consumption is null) = 0 then 'PASS' else 'STOP' end,
  jsonb_build_object('enrolled', count(*), 'with_reading', count(gr.id),
    'missing_units', coalesce(jsonb_agg(e.unit_number order by e.unit_number) filter (where gr.id is null or gr.consumption is null), '[]'::jsonb))
from enrolled e
left join public.tb810_gas_readings gr on gr.unit_id = e.id and gr.reading_month = (select package_month from params)
union all
select 5, 'reading chain continuity (previous = prior current)',
  case when count(*) = 0 then 'PASS' else 'STOP' end,
  coalesce(jsonb_agg(jsonb_build_object('unit', c.unit_number, 'month', c.reading_month, 'previous', c.previous_reading,
    'prior_current', c.prior_current, 'current', c.current_reading) order by c.unit_number, c.reading_month), '[]'::jsonb)
from chain c
where c.prior_current is not null and c.previous_reading is distinct from c.prior_current
union all
select 6, 'decreasing or scale-break readings',
  case when count(*) = 0 then 'PASS' else 'STOP' end,
  coalesce(jsonb_agg(jsonb_build_object('unit', c.unit_number, 'month', c.reading_month, 'previous', c.previous_reading,
    'current', c.current_reading, 'consumption', c.consumption) order by c.unit_number, c.reading_month), '[]'::jsonb)
from chain c
where c.current_reading < c.previous_reading
   or (c.previous_reading > 0 and (c.current_reading / c.previous_reading > 5 or c.current_reading / c.previous_reading < 0.2))
union all
select 7, 'consumption outliers (> 5x the Unit median and > 5 m3)', 'INFO',
  coalesce(jsonb_agg(jsonb_build_object('unit', c.unit_number, 'month', c.reading_month, 'consumption', c.consumption,
    'median', c.median_consumption) order by c.unit_number, c.reading_month), '[]'::jsonb)
from chain c
where c.consumption > 5 and c.consumption > 5 * coalesce(nullif(c.median_consumption, 0), 1)
union all
select 8, 'package pool (reserved and processed at approval)',
  case when count(*) filter (where b.processed_at is null) = 0 then 'PASS' else 'STOP' end,
  jsonb_build_object('bills', count(*), 'pool', sum(b.amount),
    'invoices', coalesce(jsonb_agg(b.invoice_number || ' ' || b.invoice_date || ' ' || b.amount order by b.invoice_date), '[]'::jsonb))
from public.tb810_gas_bills b
join package pk on pk.id = b.reserved_billing_period_id
union all
select 9, 'cutover seam: previous package billed the usage now leaving the package', 'INFO',
  jsonb_build_object('previous_package_status', (select status from previous_package),
    'previous_package_gas_rows', count(o.id), 'previous_package_gas_total', sum(o.amount),
    'note', 'Confirm the previous package billed the usage of the month before the package month; otherwise that usage becomes unbilled after restatement.')
from previous_package pp
left join public.tb810_monthly_financial_obligations o on o.billing_period_id = pp.id and o.obligation_type = 'gas_consumption'
union all
select 10, 'next package not yet handed off',
  case when coalesce((select status from next_package), 'absent') in ('absent', 'draft', 'collecting_readings') then 'PASS' else 'STOP' end,
  jsonb_build_object('next_package_status', coalesce((select status from next_package), 'absent'))
order by step;
