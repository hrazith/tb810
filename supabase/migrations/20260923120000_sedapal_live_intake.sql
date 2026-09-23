-- Native Common Water bills are unique per building and operational Billing Period.
-- Historical imports use legacy_table = utilities and intentionally remain exempt.
do $$
declare
  v_common_water_type_id uuid;
begin
  select id
    into v_common_water_type_id
  from public.tb810_utility_types
  where code = 'common_water'
  limit 1;

  if v_common_water_type_id is null then
    raise exception 'Common Water utility type is required before applying Sedapal intake migration.';
  end if;

  execute format(
    'create unique index if not exists tb810_native_common_water_bill_period_uidx
       on public.tb810_utility_bills (building_id, billing_period_id)
     where utility_type_id = %L::uuid
       and billing_period_id is not null
       and legacy_table is distinct from %L',
    v_common_water_type_id,
    'utilities'
  );
end;
$$;

insert into storage.buckets (id, name, public)
values ('tb810-sedapal-source-pdfs', 'tb810-sedapal-source-pdfs', false)
on conflict (id) do update set public = excluded.public;

create policy "tb810 staff can read Sedapal source PDFs"
on storage.objects
for select
to authenticated
using (bucket_id = 'tb810-sedapal-source-pdfs' and public.is_tb810_staff());

create policy "tb810 staff can upload Sedapal source PDFs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'tb810-sedapal-source-pdfs' and public.is_tb810_staff());

create policy "tb810 staff can remove Sedapal source PDFs"
on storage.objects
for delete
to authenticated
using (bucket_id = 'tb810-sedapal-source-pdfs' and public.is_tb810_staff());

create or replace function public.tb810_create_common_water_bill_with_document(
  p_bill_id uuid,
  p_building_id uuid,
  p_utility_type_id uuid,
  p_billing_period_id uuid,
  p_bill_date date,
  p_amount numeric,
  p_description text,
  p_notes text,
  p_previous_reading numeric,
  p_current_reading numeric,
  p_total_consumption numeric,
  p_unit_cost numeric,
  p_storage_bucket text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bill public.tb810_utility_bills%rowtype;
  v_document public.tb810_documents%rowtype;
begin
  if not public.has_tb810_role('building_manager') and not public.has_tb810_role('super_admin') then
    raise exception 'Only building managers or super admins may create Common Water bills.';
  end if;

  if not exists (
    select 1
    from public.tb810_utility_types
    where id = p_utility_type_id and code = 'common_water'
  ) then
    raise exception 'Common Water utility type is required.';
  end if;

  insert into public.tb810_utility_bills (
    id,
    building_id,
    utility_type_id,
    billing_period_id,
    bill_date,
    amount,
    description,
    notes,
    previous_reading,
    current_reading,
    total_consumption,
    unit_cost,
    status,
    legacy_table,
    legacy_id,
    legacy_metadata,
    created_by,
    updated_by
  ) values (
    p_bill_id,
    p_building_id,
    p_utility_type_id,
    p_billing_period_id,
    p_bill_date,
    p_amount,
    p_description,
    p_notes,
    p_previous_reading,
    p_current_reading,
    p_total_consumption,
    p_unit_cost,
    'received',
    'tb810_common_water_ledger',
    p_bill_id::text,
    jsonb_build_object(
      'slice', 'common_water_ledger',
      'utility_type_code', 'common_water',
      'source', 'sedapal_live_intake'
    ),
    auth.uid(),
    auth.uid()
  )
  returning * into v_bill;

  insert into public.tb810_documents (
    building_id,
    utility_bill_id,
    document_type,
    status,
    storage_bucket,
    storage_path,
    original_name,
    mime_type,
    size_bytes,
    metadata,
    created_by,
    updated_by
  ) values (
    p_building_id,
    v_bill.id,
    'sedapal_source_invoice',
    'received',
    p_storage_bucket,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_metadata,
    auth.uid(),
    auth.uid()
  )
  returning * into v_document;

  return jsonb_build_object(
    'bill', to_jsonb(v_bill),
    'document', to_jsonb(v_document)
  );
end;
$$;

revoke all on function public.tb810_create_common_water_bill_with_document(
  uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, bigint, jsonb
) from public, anon;
grant execute on function public.tb810_create_common_water_bill_with_document(
  uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, bigint, jsonb
) to authenticated;

comment on function public.tb810_create_common_water_bill_with_document(
  uuid, uuid, uuid, uuid, date, numeric, text, text, numeric, numeric,
  numeric, numeric, text, text, text, text, bigint, jsonb
) is 'Atomically creates a native Common Water bill and its Sedapal source document metadata.';
