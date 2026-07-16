create sequence if not exists public.tb810_unit_account_number_seq;

create or replace function public.tb810_generate_unit_account_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'UA-' || lpad(nextval('public.tb810_unit_account_number_seq')::text, 6, '0');
$$;

create or replace function public.tb810_ensure_unit_account_for_unit(target_unit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit record;
  v_account_id uuid;
begin
  select u.id, u.building_id, u.legacy_metadata
  into v_unit
  from public.tb810_units u
  where u.id = target_unit_id;

  if not found then
    raise exception 'Unit % not found', target_unit_id;
  end if;

  select ua.id
  into v_account_id
  from public.tb810_unit_accounts ua
  where ua.unit_id = target_unit_id
  order by ua.created_at asc, ua.id asc
  limit 1;

  if v_account_id is null then
    insert into public.tb810_unit_accounts (
      building_id,
      unit_id,
      account_number,
      status,
      opening_balance,
      current_balance,
      credit_balance,
      notes,
      legacy_table,
      legacy_id,
      legacy_metadata
    )
    values (
      v_unit.building_id,
      target_unit_id,
      public.tb810_generate_unit_account_number(),
      'active',
      0,
      0,
      0,
      'Auto-created from unit',
      'tb810_units',
      target_unit_id::text,
      coalesce(v_unit.legacy_metadata, '{}'::jsonb) || jsonb_build_object('auto_created', true)
    )
    returning id into v_account_id;
  end if;

  return v_account_id;
end;
$$;

create or replace function public.tb810_create_unit_account_on_unit_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tb810_ensure_unit_account_for_unit(new.id);
  return new;
end;
$$;

create or replace function public.tb810_protect_unit_account_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_number is distinct from old.account_number then
    raise exception 'account_number is immutable';
  end if;

  return new;
end;
$$;

do $$
declare
  v_unit record;
  v_keeper_id uuid;
  v_duplicate_id uuid;
begin
  for v_unit in
    select ua.unit_id
    from public.tb810_unit_accounts ua
    group by ua.unit_id
    having count(*) > 1
  loop
    with ranked_accounts as (
      select
        ua.id,
        ua.unit_id,
        ua.status,
        ua.created_at,
        ua.updated_at,
        (
          select count(*) from public.tb810_account_transactions atx where atx.unit_account_id = ua.id
        ) +
        (
          select count(*) from public.tb810_invoice_line_items ili where ili.unit_account_id = ua.id
        ) +
        (
          select count(*) from public.tb810_payment_allocations pa where pa.unit_account_id = ua.id
        ) +
        (
          select count(*) from public.tb810_credits c where c.unit_account_id = ua.id
        ) +
        (
          select count(*) from public.tb810_credit_transfers ct where ct.source_unit_account_id = ua.id or ct.destination_unit_account_id = ua.id
        ) +
        (
          select count(*) from public.tb810_documents d where d.unit_account_id = ua.id
        ) +
        (
          select count(*) from public.tb810_communications c where c.unit_account_id = ua.id
        ) as ref_count,
        row_number() over (
          partition by ua.unit_id
          order by
            (
              select count(*) from public.tb810_account_transactions atx where atx.unit_account_id = ua.id
            ) +
            (
              select count(*) from public.tb810_invoice_line_items ili where ili.unit_account_id = ua.id
            ) +
            (
              select count(*) from public.tb810_payment_allocations pa where pa.unit_account_id = ua.id
            ) +
            (
              select count(*) from public.tb810_credits c where c.unit_account_id = ua.id
            ) +
            (
              select count(*) from public.tb810_credit_transfers ct where ct.source_unit_account_id = ua.id or ct.destination_unit_account_id = ua.id
            ) +
            (
              select count(*) from public.tb810_documents d where d.unit_account_id = ua.id
            ) +
            (
              select count(*) from public.tb810_communications c where c.unit_account_id = ua.id
            ) desc,
            case when ua.status = 'active' then 0 else 1 end,
            ua.created_at asc,
            ua.id asc
        ) as rn
      from public.tb810_unit_accounts ua
      where ua.unit_id = v_unit.unit_id
    ),
    keeper as (
      select id
      from ranked_accounts
      where rn = 1
    ),
    dupes as (
      select id
      from ranked_accounts
      where rn > 1
    )
    select k.id
    into v_keeper_id
    from keeper k;

    if v_keeper_id is null then
      continue;
    end if;

    update public.tb810_account_transactions atx
    set unit_account_id = v_keeper_id
    where atx.unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    update public.tb810_invoice_line_items ili
    set unit_account_id = v_keeper_id
    where ili.unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    update public.tb810_payment_allocations pa
    set unit_account_id = v_keeper_id
    where pa.unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    update public.tb810_credits c
    set unit_account_id = v_keeper_id
    where c.unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    update public.tb810_credit_transfers ct
    set source_unit_account_id = case when ct.source_unit_account_id in (
        select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
      ) then v_keeper_id else ct.source_unit_account_id end,
        destination_unit_account_id = case when ct.destination_unit_account_id in (
        select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
      ) then v_keeper_id else ct.destination_unit_account_id end
    where ct.source_unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    )
    or ct.destination_unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    update public.tb810_documents d
    set unit_account_id = v_keeper_id
    where d.unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    update public.tb810_communications c
    set unit_account_id = v_keeper_id
    where c.unit_account_id in (
      select id from public.tb810_unit_accounts where unit_id = v_unit.unit_id and id <> v_keeper_id
    );

    delete from public.tb810_unit_accounts ua
    where ua.unit_id = v_unit.unit_id
      and ua.id <> v_keeper_id;
  end loop;
end;
$$;

insert into public.tb810_unit_accounts (
  building_id,
  unit_id,
  account_number,
  status,
  opening_balance,
  current_balance,
  credit_balance,
  notes,
  legacy_table,
  legacy_id,
  legacy_metadata
)
select
  u.building_id,
  u.id,
  public.tb810_generate_unit_account_number(),
  'active',
  0,
  0,
  0,
  'Auto-created from unit',
  'tb810_units',
  u.id::text,
  coalesce(u.legacy_metadata, '{}'::jsonb) || jsonb_build_object('auto_created', true)
from public.tb810_units u
where not exists (
  select 1
  from public.tb810_unit_accounts ua
  where ua.unit_id = u.id
);

update public.tb810_unit_accounts ua
set account_number = public.tb810_generate_unit_account_number()
where ua.account_number is null;

update public.tb810_unit_accounts ua
set account_number = public.tb810_generate_unit_account_number()
where exists (
  select 1
  from public.tb810_unit_accounts other
  where other.account_number = ua.account_number
    and other.id <> ua.id
);

update public.tb810_unit_accounts ua
set building_id = u.building_id
from public.tb810_units u
where u.id = ua.unit_id
  and ua.building_id is distinct from u.building_id;

delete from public.tb810_unit_accounts ua
where not exists (
  select 1
  from public.tb810_units u
  where u.id = ua.unit_id
);

drop trigger if exists tb810_ownerships_sync_unit_account on public.tb810_ownerships;
drop function if exists public.tb810_sync_unit_account_for_ownership();

drop index if exists public.tb810_unit_accounts_unique_active_account;
drop index if exists public.tb810_unit_accounts_one_active_per_unit;
drop index if exists public.tb810_unit_accounts_owner_id_idx;

alter table public.tb810_unit_accounts
  drop column if exists ownership_id,
  drop column if exists owner_id;

alter table public.tb810_unit_accounts
  alter column account_number set default public.tb810_generate_unit_account_number();

update public.tb810_unit_accounts
set account_number = public.tb810_generate_unit_account_number()
where account_number is null;

alter table public.tb810_unit_accounts
  alter column account_number set not null;

alter table public.tb810_unit_accounts
  add constraint tb810_unit_accounts_unit_id_key unique (unit_id);

alter table public.tb810_unit_accounts
  add constraint tb810_unit_accounts_account_number_key unique (account_number);

drop trigger if exists tb810_unit_accounts_protect_account_number on public.tb810_unit_accounts;
create trigger tb810_unit_accounts_protect_account_number
before update on public.tb810_unit_accounts
for each row execute function public.tb810_protect_unit_account_number();

drop trigger if exists tb810_units_create_unit_account on public.tb810_units;
create trigger tb810_units_create_unit_account
after insert on public.tb810_units
for each row execute function public.tb810_create_unit_account_on_unit_insert();

select public.tb810_ensure_unit_account_for_unit(id)
from public.tb810_units;
