# Ownerships Domain

## Purpose

Ownership is the historical relationship that records which Owner is responsible for a Unit during a defined period.

It is a relationship, not a balance, not a financial account, and not the asset itself.

TB810 uses billing-month responsibility, not a legal transfer date. Users select a Billing-effective month, and the system normalizes it to the first day of that month for storage.

## Responsibilities

The Ownership aggregate is responsible for:

- linking one Owner to one Unit over time
- preserving transfer history
- defining who is responsible at a billing-cycle boundary
- supporting ownership transfer workflows

Ownership does not own the Unit Account, the Unit's debt, or the generated invoices.

## Existing Schema Fields

The current `tb810_ownerships` table contains:

### `id`

Primary identifier for the Ownership record.

### `owner_id`

Reference to the current Owner in the Ownership relationship.

### `unit_id`

Reference to the Unit being owned.

### `start_date`

Beginning of the Ownership period.

Recommended meaning:

- this is the billing-month boundary for the relationship
- it should be the first day of the billing month from which TB810 considers the Owner responsible for the Unit
- it is not a legal transfer date

The exact legal transfer date is not captured.

### `end_date`

Ending of the Ownership period.

Recommended rule:

- active ownership is the row where `start_date <= billing_period.starts_on`
- and `end_date is null or end_date >= billing_period.starts_on`

Ownership lifecycle states are distinct:

- Current Ownership starts on or before the current billing month and has no earlier end date
- Scheduled Ownership starts after the current billing month
- Past Ownership ends before the current billing month

This keeps the billing boundary deterministic and easy to query.

### `billing_enabled`

Current flag indicating whether the Ownership participates in billing.

Recommendation:

- remove it in the target model unless a future exception case is proven
- billing responsibility should be derived from the active Ownership record itself

Because TB810 supports one current Owner per Unit, a separate boolean billing switch adds complexity without a confirmed business need.

### `ownership_share`

Current optional numeric share field.

Recommendation:

- remove it

Reason:

- co-ownership is not supported
- partial shares are not a future requirement
- the field introduces unsupported complexity

### `notes`

Freeform operational notes about the Ownership record.

### `legacy_table`

Legacy provenance field.

### `legacy_id`

Legacy provenance field.

### `legacy_metadata`

Structured provenance metadata from the source system.

### `created_at`

Creation timestamp.

### `updated_at`

Last update timestamp.

## Conceptual Fields for the Mature Domain

The mature Ownership model conceptually includes:

- id
- owner_id
- unit_id
- start_date
- end_date
- billing responsibility indicator if needed
- notes
- provenance fields
- created_at
- updated_at

## Ownership Invariants

These are permanent rules for TB810:

- at most one active Ownership per Unit
- no overlapping Ownership periods for the same Unit
- an Ownership must have a start date
- end date cannot precede start date
- closed Ownership records are historical and must not be deleted
- changing Owner does not alter the Unit Account
- changing Owner does not rewrite historical invoices, payments, or receipts
- Owner archival must not delete Ownership history
- Unit metadata edits must not change Ownership
- Ownership is never hard deleted once financially relevant

## Billing Responsibility

Billing responsibility changes at the billing-cycle boundary.

The responsible Owner for a Billing Period should be resolved by the Ownership active on the billing period start date.

That means:

- the Owner active on the first day of the Billing Period is the responsible Owner for that period
- a sale during the month affects the next billing period, not the current one
- existing invoices do not move to the incoming Owner after the invoice is issued
- the incoming Owner inherits all outstanding Unit Account debt
- historical invoices remain unchanged
- no prorating occurs

This model is deterministic and matches the confirmed business rule that the association does not prorate mid-cycle transfers.

## Ownership Transfer Rules

Ownership transfer is a business workflow, not generic CRUD.

The workflow should:

- close the current Ownership
- create the new Ownership
- preserve the Unit Account
- preserve the historical invoice and payment trail
- determine which future Billing Period will use the incoming Owner

## Current Schema Review

The current schema already supports the basic relationship shape, but it also includes implementation choices that are too specific to the legacy backfill.

### Fields to retain

- `owner_id`
- `unit_id`
- `start_date`
- `end_date`
- `notes`
- provenance fields
- timestamps

### Fields to remove in the target model

- `billing_enabled`
- `ownership_share`

### Fields to clarify

- `start_date` as billing-month boundary
- `end_date` as inclusive end date for the relationship

### Missing constraints

- prevent overlapping active Ownerships for the same Unit
- ensure `end_date >= start_date`
- enforce only one active Ownership per Unit

### Missing indexes

The current `owner_id` and `unit_id` indexes are directionally correct.

The target model may also need a supporting index for period lookups by `unit_id`, `start_date`, and `end_date` if query patterns require it.

### Trigger and function concerns

The current ownership sync trigger is coupled to the legacy Unit Account backfill behavior.

That coupling is not a good long-term Ownership responsibility model because Ownership should describe responsibility, not create or close accounts.

### Overlap enforcement

Either a database exclusion constraint or an application transaction must prevent overlapping Ownership periods.

Because ownership transfer is financially relevant, the safest path is to enforce it at the database level if feasible, with application-level validation as a second layer.

## Open Questions

Only a few decisions remain unresolved:

- whether `end_date` should be inclusive or whether a half-open interval should be used everywhere
- whether overlap prevention should be enforced purely by database constraint or by transactional application logic plus validation
