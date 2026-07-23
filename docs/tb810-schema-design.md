# Torre Balta 810 Schema Design

## Overview

This document describes the initial Supabase implementation package for Torre Balta 810. It keeps the legacy condo-management business model, but shifts accounting to unit-level ledgers through `unit_accounts` and `account_transactions`.

The schema is intentionally staff-first. There is no owner portal yet.

## Final Table List

### Core property model

- `tb810_buildings`
- `tb810_unit_types`
- `tb810_units`
- `tb810_owners`
- `tb810_ownerships`
- `tb810_unit_accounts`

### Accounting ledger model

- `tb810_billing_periods`
- `tb810_invoices`
- `tb810_invoice_line_items`
- `tb810_payments`
- `tb810_payment_allocations`
- `tb810_account_transactions`
- `tb810_credits`
- `tb810_credit_transfers`

### Utility model

- `tb810_utility_types`
- `tb810_utility_bills`
- `tb810_meter_readings`

### Operations model

- `tb810_suppliers`
- `tb810_expenses`
- `tb810_documents`
- `tb810_communications`
- `tb810_audit_logs`

### Staff and permissions

- `tb810_staff_profiles`
- `tb810_roles`
- `tb810_permissions`
- `tb810_role_permissions`
- `tb810_staff_roles`

## Table Purposes and Key Fields

### `tb810_buildings`

- Purpose: condo/building master record
- Key fields: `name`, `legal_name`, `address`, `contact_phone`, `contact_email`, `tax_id`, `legacy_table`, `legacy_id`, `legacy_metadata`
- Legacy source: `buildings`

### `tb810_unit_types`

- Purpose: lookup for condo, parking, storage
- Key fields: `code`, `name`, `sort_order`
- Legacy source: `unit_types`

### `tb810_units`

- Purpose: physical/legal property registry
- Key fields: `building_id`, `unit_type_id`, `unit_number`, `floor`, `share_percentage`, `has_meter`, `billing_adjustment_amount`
- Legacy source: `units`

### `tb810_owners`

- Purpose: owner identity and contact record
- Key fields: `full_name`, `document_type`, `document_number`, `email`, `phone_number`, `code`, `active`
- Legacy source: `owners`

### `tb810_ownerships`

- Purpose: time-bound owner-to-unit relationship
- Key fields: `owner_id`, `unit_id`, `start_date`, `end_date`, `billing_enabled`, `ownership_share`
- Legacy source: `owner_unit`

### `tb810_unit_accounts`

- Purpose: core financial ledger per unit and ownership period
- Key fields: `building_id`, `unit_id`, `ownership_id`, `owner_id`, `current_balance`, `credit_balance`, `status`
- Newly introduced: yes
- Notes: this is the accounting anchor for all charges, credits, payments, allocations, and delinquencies

### `tb810_billing_periods`

- Purpose: month-based billing window
- Key fields: `building_id`, `period_year`, `period_month`, `starts_on`, `ends_on`, `status`
- Newly introduced: yes

### `tb810_invoices`

- Purpose: owner-facing bill header for a billing period
- Key fields: `building_id`, `billing_period_id`, `owner_id`, `invoice_number`, `status`, `subtotal`, `total`, `balance_due`, `approved_by`, `sent_at`
- Legacy source: `maintenance_bills`
- Notes: presentation layer only; accounting still happens at the unit-account level

### `tb810_invoice_line_items`

- Purpose: detailed invoice rows
- Key fields: `invoice_id`, `unit_account_id`, `description`, `quantity`, `unit_price`, `amount`, `line_type`, `source_type`, `source_id`
- Legacy source: `detail_bills`
- Notes: line items must reference `unit_account_id`

### `tb810_payments`

- Purpose: payment header
- Key fields: `building_id`, `owner_id`, `payment_date`, `amount_received`, `receipt_number`, `payment_method`, `provider_name`, `provider_reference`, `status`
- Legacy source: `payments`

### `tb810_payment_allocations`

- Purpose: payment-to-account allocation
- Key fields: `payment_id`, `invoice_id`, `unit_account_id`, `amount`, `allocation_type`, `notes`
- Legacy source: `detail_payments`

### `tb810_account_transactions`

- Purpose: auditable ledger of every financial movement
- Key fields: `unit_account_id`, `transaction_type`, `amount`, `invoice_id`, `payment_id`, `payment_allocation_id`, `credit_id`, `credit_transfer_id`
- Newly introduced: yes
- Notes: every charge, payment, credit, transfer, adjustment, reversal, and late fee should appear here or be represented through it

### `tb810_credits`

- Purpose: unit-account scoped credit balance
- Key fields: `unit_account_id`, `source_type`, `source_id`, `amount`, `remaining_amount`, `status`
- Newly introduced: yes
- Notes: credits are not pooled across units automatically

### `tb810_credit_transfers`

- Purpose: move credit between unit accounts with auditability
- Key fields: `source_unit_account_id`, `destination_unit_account_id`, `amount`, `reason`, `status`, `approved_by`
- Newly introduced: yes
- Notes: source and destination must differ

### `tb810_utility_types`

- Purpose: utility lookup
- Key fields: `code`, `name`, `active`
- Legacy source: `utility_types`

### `tb810_utility_bills`

- Purpose: supplier bill for water or common utilities
- Key fields: `building_id`, `utility_type_id`, `billing_period_id`, `supplier_id`, `bill_date`, `amount`, `status`
- Newly introduced: yes

### `tb810_meter_readings`

- Purpose: meter reading history for condo units
- Key fields: `building_id`, `unit_id`, `utility_type_id`, `reading_date`, `reading_start`, `reading_end`, `consumption`
- Legacy source: `meters`
- Notes: parking and storage should not receive meter readings; this is expected to be enforced by application rules or a trigger later

### `tb810_suppliers`

- Purpose: vendor registry
- Key fields: `building_id`, `name`, `contact_name`, `document_type`, `document_number`, `bank_name`, `bank_account`
- Legacy source: `suppliers`

### `tb810_expenses`

- Purpose: operational expense record
- Key fields: `building_id`, `supplier_id`, `expense_date`, `category`, `description`, `amount`, `status`
- Newly introduced: yes

### `tb810_documents`

- Purpose: document trail for vouchers, bank statements, receipts, and supporting evidence
- Key fields: `building_id`, `owner_id`, `unit_id`, `unit_account_id`, `invoice_id`, `payment_id`, `credit_id`, `credit_transfer_id`, `utility_bill_id`, `storage_bucket`, `storage_path`, `document_type`, `status`
- Legacy source: `media`
- Notes: this replaces the generic polymorphic media table with a storage-backed document model

### `tb810_communications`

- Purpose: message and notice trail
- Key fields: `building_id`, `owner_id`, `unit_account_id`, `channel`, `subject`, `body`, `status`, `sent_at`
- Newly introduced: yes

### `tb810_audit_logs`

- Purpose: immutable audit log
- Key fields: `building_id`, `actor_staff_profile_id`, `action`, `entity_table`, `entity_id`, `reason`, `metadata`
- Newly introduced: yes

### `tb810_staff_profiles`

- Purpose: staff profile linked to Supabase Auth
- Key fields: `user_id`, `display_name`, `job_title`, `status`
- Legacy source: `users`

### `tb810_roles`

- Purpose: staff role catalog
- Key fields: `key`, `name`, `description`

### `tb810_permissions`

- Purpose: granular permission catalog
- Key fields: `key`, `name`, `description`

### `tb810_role_permissions`

- Purpose: role-to-permission bridge
- Key fields: `role_id`, `permission_id`

### `tb810_staff_roles`

- Purpose: staff-to-role bridge
- Key fields: `staff_profile_id`, `role_id`

## Constraints

- UUID primary keys are used throughout.
- Money fields use `numeric(12,2)`.
- Percent/share fields use `numeric(8,4)`.
- Invoice line items reference `unit_account_id`.
- Payment allocations reference `unit_account_id` and optionally `invoice_id`.
- Account transactions reference `unit_account_id`.
- Credit transfers require both source and destination unit account IDs.
- Credit transfers cannot point to the same unit account on both sides.
- Status fields use check constraints or enums.
- Legacy traceability fields are included where useful: `legacy_table`, `legacy_id`, `legacy_metadata`.

## Index Strategy

Index by the columns most frequently used for staff filtering and reconciliation:

- `building_id`
- `owner_id`
- `unit_id`
- `unit_account_id`
- `billing_period_id`
- `invoice_id`
- `payment_id`
- `supplier_id`
- `utility_type_id`
- `created_by`
- `updated_by`

Also keep unique constraints on:

- `tb810_unit_types.code`
- `tb810_utility_types.code`
- `tb810_roles.key`
- `tb810_permissions.key`
- `tb810_units(building_id, unit_number)`
- `tb810_billing_periods(building_id, period_year, period_month)`
- `tb810_invoices(building_id, invoice_number)`
- `tb810_role_permissions(role_id, permission_id)`
- `tb810_staff_roles(staff_profile_id, role_id)`

