create or replace function public.tb810_get_unit_ownership_account_snapshot(
  p_unit_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with ownership_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'owner_id', o.owner_id,
      'unit_id', o.unit_id,
      'start_date', o.start_date,
      'end_date', o.end_date,
      'notes', o.notes,
      'legacy_table', o.legacy_table,
      'legacy_id', o.legacy_id,
      'legacy_metadata', o.legacy_metadata,
      'created_at', o.created_at,
      'updated_at', o.updated_at,
      'owner', jsonb_build_object(
        'id', ow.id,
        'full_name', ow.full_name,
        'owner_reference', ow.owner_reference,
        'active', ow.active
      )
    ) order by o.start_date desc, o.created_at desc), '[]'::jsonb) as rows
    from public.tb810_ownerships o
    left join public.tb810_owners ow on ow.id = o.owner_id
    where o.unit_id = p_unit_id
  ),
  unit_account as (
    select to_jsonb(ua) as row
    from public.tb810_unit_accounts ua
    where ua.unit_id = p_unit_id
    order by ua.created_at asc
    limit 1
  )
  select jsonb_build_object(
    'ownershipRows', (select rows from ownership_rows),
    'unitAccount', (select row from unit_account)
  )
$$;
