-- K6.4: keep oldest-first ordering separate from native approval eligibility.
create or replace function public.tb810_get_giuliana_package_progression(
  p_building_id uuid,
  p_start_year integer,
  p_start_month integer
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with recursive progression as (
  select
    p_start_year * 12 + p_start_month as month_ordinal,
    bp.id,
    bp.period_year,
    bp.period_month,
    bp.status,
    coalesce(bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed'), false) as handed_off
  from (select 1) seed
  left join public.tb810_billing_periods bp
    on bp.building_id = p_building_id
    and bp.period_year = p_start_year
    and bp.period_month = p_start_month

  union all

  select
    progression.month_ordinal + 1,
    bp.id,
    bp.period_year,
    bp.period_month,
    bp.status,
    coalesce(bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed'), false)
  from progression
  left join public.tb810_billing_periods bp
    on bp.building_id = p_building_id
    and bp.period_year = (progression.month_ordinal + 1) / 12
    and bp.period_month = (progression.month_ordinal + 1) % 12
  where progression.handed_off
    and progression.id is not null
    and progression.month_ordinal < 2147483647
),
active as (
  select *
  from progression
  where not handed_off
  order by month_ordinal
  limit 1
),
handoff as (
  select bp.id, bp.period_year, bp.period_month, bp.status
  from public.tb810_billing_periods bp
  cross join active
  where bp.building_id = p_building_id
    and (bp.period_year * 12 + bp.period_month) < active.month_ordinal
    and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
  order by bp.period_year desc, bp.period_month desc
  limit 1
),
pending_reviews as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'billingPeriodId', review.id,
    'obligationMonth', format('%s-%s', review.period_year, lpad(review.period_month::text, 2, '0')),
    'status', review.status,
    'outstanding', true,
    'chronologicallyActionable', review.review_order = 1,
    'approvalEligible', review.review_order = 1
      and review.gas_reservation_state in ('native_reserved', 'native_empty')
  ) order by review.period_year, review.period_month), '[]'::jsonb) as value
  from (
    select
      bp.id,
      bp.period_year,
      bp.period_month,
      bp.status,
      bp.gas_reservation_state,
      row_number() over (order by bp.period_year, bp.period_month) as review_order
    from public.tb810_billing_periods bp
    where bp.building_id = p_building_id
      and bp.status = 'ready_for_review'
  ) review
)
select jsonb_build_object(
  'activePackage', jsonb_build_object(
    'obligationMonth', format('%s-%s', coalesce(active.period_year, ((active.month_ordinal - 1) / 12)::integer), lpad(coalesce(active.period_month, ((active.month_ordinal - 1) % 12) + 1)::text, 2, '0')),
    'mode', 'live',
    'status', active.status
  ),
  'mostRecentHandoff', case when handoff.id is null then null else jsonb_build_object(
    'obligationMonth', format('%s-%s', handoff.period_year, lpad(handoff.period_month::text, 2, '0')),
    'status', handoff.status
  ) end,
  'pendingReviews', pending_reviews.value
)
from active
left join handoff on true
cross join pending_reviews
$$;

revoke all on function public.tb810_get_giuliana_package_progression(uuid, integer, integer) from public;
grant execute on function public.tb810_get_giuliana_package_progression(uuid, integer, integer) to authenticated, service_role;
