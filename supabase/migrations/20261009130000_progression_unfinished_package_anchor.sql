-- Progression anchors on unfinished business, not on the calendar.
--
-- Frozen rule: the active package is the first obligation month that has not
-- crossed the handoff boundary; the calendar alone must not advance focus.
-- The walk previously started at the operating month, so a package still
-- live when its month ended became unreachable. It now starts at
--   least(operating month, month after the latest handed-off period)
-- and falls back to the operating month when nothing has been handed off.
-- Calendar eligibility is still enforced by the handoff itself.
--
-- Months are ordinals year * 12 + (month - 1). The previous year * 12 + month
-- encoding resolved the month after November to month 0 of the next year.
--
-- Contract unchanged: same signature and payload; p_start_* is the operating
-- month and now bounds the anchor instead of being the anchor.
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
with recursive anchor as (
  select least(
    p_start_year * 12 + (p_start_month - 1),
    coalesce(
      (
        select max(bp.period_year * 12 + (bp.period_month - 1)) + 1
        from public.tb810_billing_periods bp
        where bp.building_id = p_building_id
          and bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed')
      ),
      p_start_year * 12 + (p_start_month - 1)
    )
  ) as month_ordinal
),
progression as (
  select
    anchor.month_ordinal,
    bp.id,
    bp.period_year,
    bp.period_month,
    bp.status,
    coalesce(bp.status in ('ready_for_review', 'approved', 'invoices_generated', 'closed'), false) as handed_off
  from anchor
  left join public.tb810_billing_periods bp
    on bp.building_id = p_building_id
    and bp.period_year = anchor.month_ordinal / 12
    and bp.period_month = anchor.month_ordinal % 12 + 1

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
    and bp.period_month = (progression.month_ordinal + 1) % 12 + 1
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
    and (bp.period_year * 12 + (bp.period_month - 1)) < active.month_ordinal
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
    'approvalEligible', coalesce(
      review.review_order = 1
      and review.gas_reservation_state in ('native_reserved', 'native_empty'),
      false
    )
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
    'obligationMonth', format('%s-%s', active.month_ordinal / 12, lpad((active.month_ordinal % 12 + 1)::text, 2, '0')),
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

-- create or replace keeps the existing ACL; restate it so this migration
-- cannot reopen anon access closed by 20261009120000_api_surface_lockdown.
revoke all on function public.tb810_get_giuliana_package_progression(uuid, integer, integer) from public, anon;
grant execute on function public.tb810_get_giuliana_package_progression(uuid, integer, integer) to authenticated, service_role;
