create or replace function public.tb810_get_owner_directory(
  p_status text default 'active',
  p_query text default null
)
returns table (
  id uuid,
  owner_reference text,
  full_name text,
  email text,
  phone_number text,
  notes text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  unit_count integer
)
language sql
stable
set search_path = public
as $$
  with filtered_owners as (
    select o.*
    from public.tb810_owners o
    where
      case
        when p_status = 'archived' then o.active = false
        when p_status = 'all' then true
        else o.active = true
      end
      and (
        nullif(btrim(p_query), '') is null
        or o.full_name ilike ('%' || p_query || '%')
        or o.owner_reference ilike ('%' || p_query || '%')
        or coalesce(o.email, '') ilike ('%' || p_query || '%')
        or coalesce(o.phone_number, '') ilike ('%' || p_query || '%')
      )
  ),
  ownership_counts as (
    select
      ow.owner_id,
      count(*)::integer as unit_count
    from public.tb810_ownerships ow
    group by ow.owner_id
  )
  select
    fo.id,
    fo.owner_reference,
    fo.full_name,
    fo.email,
    fo.phone_number,
    fo.notes,
    fo.active,
    fo.created_at,
    fo.updated_at,
    coalesce(oc.unit_count, 0) as unit_count
  from filtered_owners fo
  left join ownership_counts oc on oc.owner_id = fo.id
  order by fo.full_name asc, fo.id asc
$$;

grant execute on function public.tb810_get_owner_directory(text, text) to authenticated;
