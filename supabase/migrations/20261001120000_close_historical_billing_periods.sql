-- Historical Unit Water and Sedapal source facts through July 2026 were
-- completed outside TB810. Represent their consuming packages as terminal
-- historical periods without fabricating native approval artifacts.
update public.tb810_billing_periods
set status = 'closed',
    approved_by = null,
    approved_at = null
where id in (
  'e19907a0-8796-455d-b28a-b65762674bfe',
  'bacd74d9-ea1a-4be6-87a0-ce39cc18590c',
  'c527b221-fdee-41da-986d-58ad119fdbd7'
)
  and building_id = 'b7a8c3d4-7b4a-4d7a-8d53-5f18d0c6b810'
  and period_year = 2026
  and period_month in (6, 7, 8)
  and approved_by is null
  and approved_at is null
  and not exists (
    select 1
    from public.tb810_monthly_financial_obligations o
    where o.billing_period_id = tb810_billing_periods.id
  )
  and not exists (
    select 1
    from public.tb810_invoices i
    where i.billing_period_id = tb810_billing_periods.id
  );
