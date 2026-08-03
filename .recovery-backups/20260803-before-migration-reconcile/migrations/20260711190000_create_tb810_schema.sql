create extension if not exists "pgcrypto";

create type public.tb810_unit_type_code as enum ('condo', 'parking', 'storage');
create type public.tb810_utility_type_code as enum ('water', 'common_water', 'common_electricity');
create type public.tb810_account_transaction_type as enum (
  'charge',
  'payment',
  'credit',
  'credit_transfer_in',
  'credit_transfer_out',
  'adjustment',
  'reversal',
  'late_fee'
);
create type public.tb810_payment_allocation_type as enum (
  'fixed',
  'water',
  'common',
  'credit',
  'other'
);
create type public.tb810_invoice_status as enum ('draft', 'generated', 'pending_approval', 'approved', 'sent', 'partially_paid', 'paid', 'void');
create type public.tb810_payment_status as enum ('pending', 'posted', 'partially_reconciled', 'reconciled', 'void');
create type public.tb810_credit_status as enum ('active', 'transferred', 'consumed', 'void');
create type public.tb810_credit_transfer_status as enum ('pending', 'approved', 'posted', 'reversed');
create type public.tb810_document_status as enum ('draft', 'received', 'reviewed', 'approved', 'archived');
create type public.tb810_communication_status as enum ('draft', 'queued', 'sent', 'failed');
create type public.tb810_audit_action as enum ('insert', 'update', 'delete', 'approve', 'reverse', 'transfer_credit', 'reconcile', 'import');
create type public.tb810_role_key as enum (
  'super_admin',
  'building_manager',
  'reconciliation_specialist',
  'building_staff',
  'viewer'
);

create table public.tb810_buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  address text,
  contact_phone text,
  contact_email text,
  tax_id text,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_unit_types (
  id uuid primary key default gen_random_uuid(),
  code public.tb810_unit_type_code not null unique,
  name text not null,
  sort_order integer not null default 0,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_owners (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone_number text,
  owner_reference text not null unique,
  notes text,
  active boolean not null default true,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.tb810_owner_reference_seq;

create or replace function public.tb810_generate_owner_reference()
returns text
language sql
as $$
  select 'OWN-' || lpad(nextval('public.tb810_owner_reference_seq')::text, 6, '0');
$$;

create or replace function public.tb810_protect_owner_reference()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_reference is null then
      new.owner_reference := public.tb810_generate_owner_reference();
    end if;
    return new;
  end if;

  if new.owner_reference is distinct from old.owner_reference then
    raise exception 'owner_reference is immutable';
  end if;

  return new;
end;
$$;

create trigger tb810_owners_protect_owner_reference
before insert or update on public.tb810_owners
for each row execute function public.tb810_protect_owner_reference();

create table public.tb810_units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_type_id uuid not null references public.tb810_unit_types(id),
  unit_number text not null,
  floor text,
  share_percentage numeric(8,4) not null default 0,
  display_name text,
  has_meter boolean not null default false,
  billing_adjustment_amount numeric(12,2) not null default 0,
  notes text,
  active boolean not null default true,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, unit_number)
);

create table public.tb810_ownerships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.tb810_owners(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  billing_enabled boolean not null default true,
  ownership_share numeric(8,4),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_unit_accounts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  ownership_id uuid references public.tb810_ownerships(id) on delete set null,
  owner_id uuid references public.tb810_owners(id) on delete set null,
  account_number text,
  status text not null default 'active' check (status in ('active', 'inactive', 'closed')),
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  credit_balance numeric(12,2) not null default 0,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, ownership_id)
);

create table public.tb810_billing_periods (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'collecting_readings', 'ready_for_review', 'approved', 'invoices_generated', 'closed')),
  approved_by uuid,
  approved_at timestamptz,
  approval_notes text,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, period_year, period_month)
);

create table public.tb810_invoices (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  billing_period_id uuid not null references public.tb810_billing_periods(id) on delete cascade,
  owner_id uuid not null references public.tb810_owners(id) on delete cascade,
  invoice_number text not null,
  presentation_name text,
  issue_date date not null default current_date,
  due_date date,
  status public.tb810_invoice_status not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  generated_by uuid,
  generated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  sent_at timestamptz,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, invoice_number),
  unique (billing_period_id, owner_id)
);

create table public.tb810_utility_types (
  id uuid primary key default gen_random_uuid(),
  code public.tb810_utility_type_code not null unique,
  name text not null,
  active boolean not null default true,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_suppliers (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  name text not null,
  contact_name text,
  document_type text,
  document_number text,
  description text,
  phone_number text,
  email text,
  bank_name text,
  bank_account text,
  bank_route text,
  active boolean not null default true,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_meter_readings (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  unit_id uuid not null references public.tb810_units(id) on delete cascade,
  utility_type_id uuid not null references public.tb810_utility_types(id),
  reading_date date not null,
  reading_start numeric(12,3),
  reading_end numeric(12,3),
  consumption numeric(12,3),
  unit_of_measure text not null default 'm3',
  status text not null default 'recorded' check (status in ('recorded', 'reviewed', 'approved', 'void')),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  entered_by uuid,
  entered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_utility_bills (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  utility_type_id uuid not null references public.tb810_utility_types(id),
  billing_period_id uuid references public.tb810_billing_periods(id) on delete set null,
  supplier_id uuid references public.tb810_suppliers(id) on delete set null,
  bill_date date not null,
  amount numeric(12,2) not null,
  description text,
  attachment_document_id uuid,
  status text not null default 'received' check (status in ('received', 'reviewed', 'approved', 'paid', 'void')),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_communications (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  owner_id uuid references public.tb810_owners(id) on delete set null,
  unit_account_id uuid references public.tb810_unit_accounts(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email', 'sms', 'paper', 'internal')),
  subject text,
  body text,
  status public.tb810_communication_status not null default 'draft',
  sent_at timestamptz,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_payments (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  owner_id uuid not null references public.tb810_owners(id) on delete cascade,
  payment_date date not null,
  amount_received numeric(12,2) not null check (amount_received > 0),
  receipt_number text,
  payer_name text,
  payment_method text not null default 'bank_deposit',
  provider_name text,
  provider_reference text,
  status public.tb810_payment_status not null default 'pending',
  notes text,
  reversed_by uuid,
  reversed_at timestamptz,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_receipts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  payment_id uuid not null unique references public.tb810_payments(id) on delete cascade,
  owner_id uuid not null references public.tb810_owners(id) on delete cascade,
  receipt_number text not null unique,
  payment_date date not null,
  amount_received numeric(12,2) not null,
  payment_method text not null,
  reference_number text,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.tb810_payments(id) on delete cascade,
  invoice_id uuid references public.tb810_invoices(id) on delete set null,
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  allocation_type public.tb810_payment_allocation_type not null default 'other',
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_credits (
  id uuid primary key default gen_random_uuid(),
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  source_type text not null check (source_type in ('payment', 'adjustment', 'manual', 'other')),
  source_id uuid,
  amount numeric(12,2) not null check (amount > 0),
  remaining_amount numeric(12,2) not null check (remaining_amount >= 0),
  status public.tb810_credit_status not null default 'active',
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_credit_transfers (
  id uuid primary key default gen_random_uuid(),
  source_unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  destination_unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  status public.tb810_credit_transfer_status not null default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_transfers_distinct_accounts check (source_unit_account_id <> destination_unit_account_id)
);

create table public.tb810_account_transactions (
  id uuid primary key default gen_random_uuid(),
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  transaction_type public.tb810_account_transaction_type not null,
  amount numeric(12,2) not null check (amount <> 0),
  reference_type text,
  reference_id uuid,
  invoice_id uuid references public.tb810_invoices(id) on delete set null,
  payment_id uuid references public.tb810_payments(id) on delete set null,
  payment_allocation_id uuid references public.tb810_payment_allocations(id) on delete set null,
  credit_id uuid references public.tb810_credits(id) on delete set null,
  credit_transfer_id uuid references public.tb810_credit_transfers(id) on delete set null,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.tb810_invoices(id) on delete cascade,
  unit_account_id uuid not null references public.tb810_unit_accounts(id) on delete cascade,
  description text not null,
  quantity numeric(12,4) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  line_type text not null check (line_type in ('fixed', 'water', 'common', 'credit', 'other')),
  source_type text,
  source_id uuid,
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  supplier_id uuid references public.tb810_suppliers(id) on delete set null,
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(12,2) not null,
  status text not null default 'recorded' check (status in ('recorded', 'approved', 'paid', 'void')),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.tb810_buildings(id) on delete cascade,
  owner_id uuid references public.tb810_owners(id) on delete set null,
  unit_id uuid references public.tb810_units(id) on delete set null,
  unit_account_id uuid references public.tb810_unit_accounts(id) on delete set null,
  invoice_id uuid references public.tb810_invoices(id) on delete set null,
  payment_id uuid references public.tb810_payments(id) on delete set null,
  payment_allocation_id uuid references public.tb810_payment_allocations(id) on delete set null,
  credit_id uuid references public.tb810_credits(id) on delete set null,
  credit_transfer_id uuid references public.tb810_credit_transfers(id) on delete set null,
  utility_bill_id uuid references public.tb810_utility_bills(id) on delete set null,
  document_type text not null,
  status public.tb810_document_status not null default 'received',
  storage_bucket text,
  storage_path text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  job_title text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  notes text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_roles (
  id uuid primary key default gen_random_uuid(),
  key public.tb810_role_key not null unique,
  name text not null,
  description text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  legacy_table text,
  legacy_id text,
  legacy_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tb810_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.tb810_roles(id) on delete cascade,
  permission_id uuid not null references public.tb810_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table public.tb810_staff_roles (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.tb810_staff_profiles(id) on delete cascade,
  role_id uuid not null references public.tb810_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_profile_id, role_id)
);

create table public.tb810_audit_logs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.tb810_buildings(id) on delete cascade,
  actor_staff_profile_id uuid references public.tb810_staff_profiles(id) on delete set null,
  action public.tb810_audit_action not null,
  entity_table text not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tb810_units_building_id_idx on public.tb810_units(building_id);
create index tb810_units_unit_type_id_idx on public.tb810_units(unit_type_id);
create index tb810_ownerships_owner_id_idx on public.tb810_ownerships(owner_id);
create index tb810_ownerships_unit_id_idx on public.tb810_ownerships(unit_id);
create index tb810_unit_accounts_unit_id_idx on public.tb810_unit_accounts(unit_id);
create index tb810_unit_accounts_owner_id_idx on public.tb810_unit_accounts(owner_id);
create index tb810_invoices_billing_period_id_idx on public.tb810_invoices(billing_period_id);
create index tb810_invoices_owner_id_idx on public.tb810_invoices(owner_id);
create index tb810_invoice_line_items_invoice_id_idx on public.tb810_invoice_line_items(invoice_id);
create index tb810_invoice_line_items_unit_account_id_idx on public.tb810_invoice_line_items(unit_account_id);
create index tb810_account_transactions_invoice_id_idx on public.tb810_account_transactions(invoice_id);
create index tb810_account_transactions_reference_id_idx on public.tb810_account_transactions(reference_id);
create index tb810_payments_owner_id_idx on public.tb810_payments(owner_id);
create index tb810_payment_allocations_payment_id_idx on public.tb810_payment_allocations(payment_id);
create index tb810_payment_allocations_unit_account_id_idx on public.tb810_payment_allocations(unit_account_id);
create index tb810_account_transactions_unit_account_id_idx on public.tb810_account_transactions(unit_account_id);
create index tb810_credits_unit_account_id_idx on public.tb810_credits(unit_account_id);
create index tb810_credit_transfers_source_idx on public.tb810_credit_transfers(source_unit_account_id);
create index tb810_credit_transfers_destination_idx on public.tb810_credit_transfers(destination_unit_account_id);
create index tb810_meter_readings_unit_id_idx on public.tb810_meter_readings(unit_id);
create index tb810_meter_readings_utility_type_id_idx on public.tb810_meter_readings(utility_type_id);
create index tb810_utility_bills_building_id_idx on public.tb810_utility_bills(building_id);
create index tb810_utility_bills_billing_period_id_idx on public.tb810_utility_bills(billing_period_id);
create index tb810_documents_unit_account_id_idx on public.tb810_documents(unit_account_id);
create index tb810_documents_invoice_id_idx on public.tb810_documents(invoice_id);
create index tb810_documents_payment_id_idx on public.tb810_documents(payment_id);
create index tb810_documents_payment_allocation_id_idx on public.tb810_documents(payment_allocation_id);
create index tb810_documents_credit_id_idx on public.tb810_documents(credit_id);
create index tb810_documents_credit_transfer_id_idx on public.tb810_documents(credit_transfer_id);
create index tb810_documents_utility_bill_id_idx on public.tb810_documents(utility_bill_id);
create index tb810_staff_profiles_user_id_idx on public.tb810_staff_profiles(user_id);
create index tb810_utility_bills_supplier_id_idx on public.tb810_utility_bills(supplier_id);
create index tb810_utility_bills_utility_type_id_idx on public.tb810_utility_bills(utility_type_id);
create index tb810_meter_readings_building_id_idx on public.tb810_meter_readings(building_id);
create index tb810_meter_readings_unit_account_hint_idx on public.tb810_meter_readings(unit_id);

create unique index tb810_unit_accounts_unique_active_account
on public.tb810_unit_accounts(unit_id, ownership_id)
where ownership_id is not null;

create unique index tb810_unit_accounts_one_active_per_unit
on public.tb810_unit_accounts(unit_id)
where status = 'active';

create or replace function public.tb810_guard_account_transaction_sign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_type in ('charge', 'credit_transfer_in', 'adjustment', 'late_fee') and new.amount <= 0 then
    raise exception 'Positive amount required for % transaction', new.transaction_type;
  end if;

  if new.transaction_type in ('payment', 'credit_transfer_out', 'reversal') and new.amount >= 0 then
    raise exception 'Negative amount required for % transaction', new.transaction_type;
  end if;

  if new.transaction_type = 'credit' and new.amount <= 0 then
    raise exception 'Positive amount required for credit transactions';
  end if;

  return new;
end;
$$;

create trigger tb810_account_transactions_sign_guard
before insert or update on public.tb810_account_transactions
for each row execute function public.tb810_guard_account_transaction_sign();

create or replace function public.tb810_guard_meter_readings_condo_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_type_code public.tb810_unit_type_code;
begin
  select ut.code
  into v_unit_type_code
  from public.tb810_units u
  join public.tb810_unit_types ut on ut.id = u.unit_type_id
  where u.id = new.unit_id;

  if v_unit_type_code is distinct from 'condo' then
    raise exception 'Meter readings are only allowed for condo units';
  end if;

  return new;
end;
$$;

create or replace function public.is_tb810_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tb810_staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.status = 'active'
  );
$$;

create or replace function public.has_tb810_role(role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tb810_staff_profiles sp
    join public.tb810_staff_roles sr on sr.staff_profile_id = sp.id
    join public.tb810_roles r on r.id = sr.role_id
    where sp.user_id = auth.uid()
      and sp.status = 'active'
      and r.key::text = role_key
  );
$$;

create or replace function public.has_tb810_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tb810_staff_profiles sp
    join public.tb810_staff_roles sr on sr.staff_profile_id = sp.id
    join public.tb810_roles r on r.id = sr.role_id
    join public.tb810_role_permissions rp on rp.role_id = r.id
    join public.tb810_permissions p on p.id = rp.permission_id
    where sp.user_id = auth.uid()
      and sp.status = 'active'
      and p.key = permission_key
  );
$$;

create or replace function public.tb810_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tb810_buildings_set_updated_at
before update on public.tb810_buildings
for each row execute function public.tb810_set_updated_at();
create trigger tb810_unit_types_set_updated_at
before update on public.tb810_unit_types
for each row execute function public.tb810_set_updated_at();
create trigger tb810_owners_set_updated_at
before update on public.tb810_owners
for each row execute function public.tb810_set_updated_at();
create trigger tb810_units_set_updated_at
before update on public.tb810_units
for each row execute function public.tb810_set_updated_at();
create trigger tb810_ownerships_set_updated_at
before update on public.tb810_ownerships
for each row execute function public.tb810_set_updated_at();
create trigger tb810_unit_accounts_set_updated_at
before update on public.tb810_unit_accounts
for each row execute function public.tb810_set_updated_at();
create trigger tb810_billing_periods_set_updated_at
before update on public.tb810_billing_periods
for each row execute function public.tb810_set_updated_at();
create trigger tb810_invoices_set_updated_at
before update on public.tb810_invoices
for each row execute function public.tb810_set_updated_at();
create trigger tb810_meter_readings_set_updated_at
before update on public.tb810_meter_readings
for each row execute function public.tb810_set_updated_at();
create trigger tb810_meter_readings_condo_only
before insert or update on public.tb810_meter_readings
for each row execute function public.tb810_guard_meter_readings_condo_only();
create trigger tb810_utility_types_set_updated_at
before update on public.tb810_utility_types
for each row execute function public.tb810_set_updated_at();
create trigger tb810_utility_bills_set_updated_at
before update on public.tb810_utility_bills
for each row execute function public.tb810_set_updated_at();
create trigger tb810_suppliers_set_updated_at
before update on public.tb810_suppliers
for each row execute function public.tb810_set_updated_at();
create trigger tb810_documents_set_updated_at
before update on public.tb810_documents
for each row execute function public.tb810_set_updated_at();
create trigger tb810_communications_set_updated_at
before update on public.tb810_communications
for each row execute function public.tb810_set_updated_at();
create trigger tb810_payments_set_updated_at
before update on public.tb810_payments
for each row execute function public.tb810_set_updated_at();
create trigger tb810_payment_allocations_set_updated_at
before update on public.tb810_payment_allocations
for each row execute function public.tb810_set_updated_at();
create trigger tb810_account_transactions_set_updated_at
before update on public.tb810_account_transactions
for each row execute function public.tb810_set_updated_at();
create trigger tb810_credits_set_updated_at
before update on public.tb810_credits
for each row execute function public.tb810_set_updated_at();
create trigger tb810_credit_transfers_set_updated_at
before update on public.tb810_credit_transfers
for each row execute function public.tb810_set_updated_at();
create trigger tb810_expenses_set_updated_at
before update on public.tb810_expenses
for each row execute function public.tb810_set_updated_at();
create trigger tb810_staff_profiles_set_updated_at
before update on public.tb810_staff_profiles
for each row execute function public.tb810_set_updated_at();
create trigger tb810_roles_set_updated_at
before update on public.tb810_roles
for each row execute function public.tb810_set_updated_at();
create trigger tb810_permissions_set_updated_at
before update on public.tb810_permissions
for each row execute function public.tb810_set_updated_at();

create or replace function public.tb810_rebuild_unit_account_balance(target_unit_account_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tb810_unit_accounts ua
  set current_balance = coalesce(tx.balance_sum, 0),
      credit_balance = coalesce(cr.credit_sum, 0)
  from (
    select unit_account_id, coalesce(sum(amount), 0) as balance_sum
    from public.tb810_account_transactions
    where unit_account_id = target_unit_account_id
    group by unit_account_id
  ) tx,
  (
    select unit_account_id, coalesce(sum(remaining_amount), 0) as credit_sum
    from public.tb810_credits
    where unit_account_id = target_unit_account_id
      and status = 'active'
    group by unit_account_id
  ) cr
  where ua.id = target_unit_account_id;
$$;

create or replace function public.tb810_sync_unit_account_for_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_account_id uuid;
  v_account_status text;
begin
  select u.building_id
  into v_building_id
  from public.tb810_units u
  where u.id = new.unit_id;

  if tg_op = 'INSERT' then
    insert into public.tb810_unit_accounts (
      building_id,
      unit_id,
      ownership_id,
      owner_id,
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
      v_building_id,
      new.unit_id,
      new.id,
      new.owner_id,
      'UA-' || substr(new.id::text, 1, 8),
      case when new.end_date is null and coalesce(new.billing_enabled, true) then 'active' else 'inactive' end,
      0,
      0,
      0,
      'Auto-created from ownership',
      'owner_unit',
      new.id::text,
      coalesce(new.legacy_metadata, '{}'::jsonb) || jsonb_build_object('auto_created', true)
    )
    on conflict (unit_id, ownership_id) do update
    set owner_id = excluded.owner_id,
        building_id = excluded.building_id,
        account_number = excluded.account_number,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = now();

    return new;
  end if;

  select ua.id, ua.status
  into v_account_id, v_account_status
  from public.tb810_unit_accounts ua
  where ua.ownership_id = new.id
  order by ua.created_at asc
  limit 1;

  if new.end_date is null and coalesce(new.billing_enabled, true) then
    if v_account_id is null then
      insert into public.tb810_unit_accounts (
        building_id,
        unit_id,
        ownership_id,
        owner_id,
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
        v_building_id,
        new.unit_id,
        new.id,
        new.owner_id,
        'UA-' || substr(new.id::text, 1, 8),
        'active',
        0,
        0,
        0,
        'Auto-created from ownership',
        'owner_unit',
        new.id::text,
        coalesce(new.legacy_metadata, '{}'::jsonb) || jsonb_build_object('auto_created', true)
      );
    elsif v_account_status <> 'active' then
      update public.tb810_unit_accounts
      set status = 'active',
          owner_id = new.owner_id,
          building_id = v_building_id,
          notes = coalesce(notes, 'Auto-created from ownership')
      where id = v_account_id;
    end if;
  else
    if v_account_id is not null and v_account_status = 'active' then
      update public.tb810_unit_accounts
      set status = 'inactive',
          owner_id = new.owner_id,
          building_id = v_building_id,
          notes = coalesce(notes, 'Closed because ownership ended')
      where id = v_account_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger tb810_ownerships_sync_unit_account
after insert or update on public.tb810_ownerships
for each row execute function public.tb810_sync_unit_account_for_ownership();

insert into public.tb810_unit_accounts (
  building_id,
  unit_id,
  ownership_id,
  owner_id,
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
  o.unit_id,
  o.id,
  o.owner_id,
  'UA-' || substr(o.id::text, 1, 8),
  case when o.end_date is null and coalesce(o.billing_enabled, true) then 'active' else 'inactive' end,
  0,
  0,
  0,
  'Backfilled from ownership',
  'owner_unit',
  o.id::text,
  coalesce(o.legacy_metadata, '{}'::jsonb) || jsonb_build_object('backfilled', true)
from public.tb810_ownerships o
join public.tb810_units u on u.id = o.unit_id
where o.end_date is null
  and coalesce(o.billing_enabled, true)
  and not exists (
    select 1
    from public.tb810_unit_accounts ua
    where ua.ownership_id = o.id
  );

alter table public.tb810_buildings enable row level security;
alter table public.tb810_unit_types enable row level security;
alter table public.tb810_owners enable row level security;
alter table public.tb810_units enable row level security;
alter table public.tb810_ownerships enable row level security;
alter table public.tb810_unit_accounts enable row level security;
alter table public.tb810_billing_periods enable row level security;
alter table public.tb810_invoices enable row level security;
alter table public.tb810_meter_readings enable row level security;
alter table public.tb810_utility_types enable row level security;
alter table public.tb810_utility_bills enable row level security;
alter table public.tb810_suppliers enable row level security;
alter table public.tb810_documents enable row level security;
alter table public.tb810_communications enable row level security;
alter table public.tb810_payments enable row level security;
alter table public.tb810_payment_allocations enable row level security;
alter table public.tb810_account_transactions enable row level security;
alter table public.tb810_credits enable row level security;
alter table public.tb810_credit_transfers enable row level security;
alter table public.tb810_expenses enable row level security;
alter table public.tb810_staff_profiles enable row level security;
alter table public.tb810_roles enable row level security;
alter table public.tb810_permissions enable row level security;
alter table public.tb810_role_permissions enable row level security;
alter table public.tb810_staff_roles enable row level security;
alter table public.tb810_audit_logs enable row level security;
create policy "tb810 staff can read buildings" on public.tb810_buildings for select using (public.is_tb810_staff());
create policy "tb810 super admin manages buildings" on public.tb810_buildings for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read unit types" on public.tb810_unit_types for select using (public.is_tb810_staff());
create policy "tb810 staff manage unit types" on public.tb810_unit_types for all using (public.has_tb810_permission('units.manage')) with check (public.has_tb810_permission('units.manage'));
create policy "tb810 staff can read owners" on public.tb810_owners for select using (public.is_tb810_staff());
create policy "tb810 staff manage owners" on public.tb810_owners for all using (public.has_tb810_permission('owners.manage')) with check (public.has_tb810_permission('owners.manage'));
create policy "tb810 staff can read units" on public.tb810_units for select using (public.is_tb810_staff());
create policy "tb810 staff manage units" on public.tb810_units for all using (public.has_tb810_permission('units.manage')) with check (public.has_tb810_permission('units.manage'));
create policy "tb810 staff can read ownerships" on public.tb810_ownerships for select using (public.is_tb810_staff());
create policy "tb810 staff manage ownerships" on public.tb810_ownerships for all using (public.has_tb810_permission('ownerships.manage')) with check (public.has_tb810_permission('ownerships.manage'));
create policy "tb810 staff can read unit accounts" on public.tb810_unit_accounts for select using (public.is_tb810_staff());
create policy "tb810 staff manage unit accounts" on public.tb810_unit_accounts for all using (public.has_tb810_permission('unit_accounts.manage')) with check (public.has_tb810_permission('unit_accounts.manage'));
create policy "tb810 staff can read billing periods" on public.tb810_billing_periods for select using (public.is_tb810_staff());
create policy "tb810 building manager manages billing periods" on public.tb810_billing_periods for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read invoices" on public.tb810_invoices for select using (public.is_tb810_staff());
create policy "tb810 billing approval workflow" on public.tb810_invoices for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 super admin can reverse invoices" on public.tb810_invoices for update using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read meter readings" on public.tb810_meter_readings for select using (public.is_tb810_staff());
create policy "tb810 manager manages meter readings" on public.tb810_meter_readings for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read utility types" on public.tb810_utility_types for select using (public.is_tb810_staff());
create policy "tb810 manager manages utility types" on public.tb810_utility_types for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read utility bills" on public.tb810_utility_bills for select using (public.is_tb810_staff());
create policy "tb810 manager manages utility bills" on public.tb810_utility_bills for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read suppliers" on public.tb810_suppliers for select using (public.is_tb810_staff());
create policy "tb810 manager manages suppliers" on public.tb810_suppliers for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read documents" on public.tb810_documents for select using (public.is_tb810_staff());
create policy "tb810 staff manage documents" on public.tb810_documents for all using (public.is_tb810_staff()) with check (public.is_tb810_staff());
create policy "tb810 staff can read communications" on public.tb810_communications for select using (public.is_tb810_staff());
create policy "tb810 staff manage communications" on public.tb810_communications for all using (public.is_tb810_staff()) with check (public.is_tb810_staff());
create policy "tb810 staff can read payments" on public.tb810_payments for select using (public.is_tb810_staff());
create policy "tb810 reconciliation can manage payments" on public.tb810_payments for insert with check (public.has_tb810_role('reconciliation_specialist') or public.has_tb810_role('super_admin'));
create policy "tb810 super admin can update payments" on public.tb810_payments for update using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 super admin can delete payments" on public.tb810_payments for delete using (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read allocations" on public.tb810_payment_allocations for select using (public.is_tb810_staff());
create policy "tb810 reconciliation can manage allocations" on public.tb810_payment_allocations for all using (public.has_tb810_role('reconciliation_specialist') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('reconciliation_specialist') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read account transactions" on public.tb810_account_transactions for select using (public.is_tb810_staff());
create policy "tb810 accounting team manages transactions" on public.tb810_account_transactions for insert with check (public.has_tb810_role('reconciliation_specialist') or public.has_tb810_role('super_admin'));
create policy "tb810 super admin manages account transactions" on public.tb810_account_transactions for update using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read credits" on public.tb810_credits for select using (public.is_tb810_staff());
create policy "tb810 super admin manages credits" on public.tb810_credits for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read credit transfers" on public.tb810_credit_transfers for select using (public.is_tb810_staff());
create policy "tb810 super admin manages credit transfers" on public.tb810_credit_transfers for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read expenses" on public.tb810_expenses for select using (public.is_tb810_staff());
create policy "tb810 manager manages expenses" on public.tb810_expenses for all using (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin')) with check (public.has_tb810_role('building_manager') or public.has_tb810_role('super_admin'));
create policy "tb810 staff can read profiles" on public.tb810_staff_profiles for select using (public.is_tb810_staff());
create policy "tb810 super admin manages profiles" on public.tb810_staff_profiles for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read roles" on public.tb810_roles for select using (public.is_tb810_staff());
create policy "tb810 super admin manages roles" on public.tb810_roles for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read permissions" on public.tb810_permissions for select using (public.is_tb810_staff());
create policy "tb810 super admin manages permissions" on public.tb810_permissions for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read role permissions" on public.tb810_role_permissions for select using (public.is_tb810_staff());
create policy "tb810 super admin manages role permissions" on public.tb810_role_permissions for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read staff roles" on public.tb810_staff_roles for select using (public.is_tb810_staff());
create policy "tb810 super admin manages staff roles" on public.tb810_staff_roles for all using (public.has_tb810_role('super_admin')) with check (public.has_tb810_role('super_admin'));
create policy "tb810 staff can read audit logs" on public.tb810_audit_logs for select using (public.is_tb810_staff());
create policy "tb810 staff insert audit logs" on public.tb810_audit_logs for insert with check (public.is_tb810_staff());

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
