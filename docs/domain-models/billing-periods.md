# Billing Periods Domain

## Purpose

A Billing Period is the monthly operational clock for TB810.

It is the orchestration record that:

- collects approved charge inputs
- determines the responsible Owner for each Unit Account
- generates one invoice per Unit Account
- records completion state for the monthly billing run

The Billing Period does not own permanent balances, ownership history, payment history, budget plan definition, meter identity, or Owner identity. It consumes or references those domains.

## Responsibilities

The Billing Period aggregate is responsible for:

- monthly cycle state
- period date boundaries
- invoice-generation readiness
- approval workflow metadata
- completion tracking
- traceability of the billing run

## Existing Schema Fields

The current `tb810_billing_periods` table contains:

### `id`

Primary identifier for the Billing Period record.

### `building_id`

Reference to the building that owns the billing cycle.

### `period_year`

Calendar year of the billing period.

### `period_month`

Calendar month of the billing period.

### `starts_on`

Start date for the billing period.

### `ends_on`

End date for the billing period.

### `status`

Current lifecycle state.

Current schema values:

- `draft`
- `collecting_readings`
- `ready_for_review`
- `approved`
- `invoices_generated`
- `closed`

### `approved_by`

User who approved the Billing Period.

### `approved_at`

Timestamp when approval was recorded.

### `approval_notes`

Freeform approval commentary.

### `notes`

General operational notes.

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

The mature Billing Period domain is expected to conceptually include:

- building
- period year
- period month
- start date
- end date
- invoice date
- due date
- utility-consumption month
- status
- budget plan reference
- review metadata
- approval metadata
- invoice-generation metadata
- close metadata
- notes

Some of these are already represented in the current schema, some are likely needed later, and some still require schema review before implementation. This document defines the business shape only.

## Lifecycle

The Billing Period should use a restrained state model:

1. Draft
2. Collecting inputs
3. Ready for review
4. Approved
5. Invoices generated
6. Closed

### Draft

- the period exists
- dates and initial settings may be prepared
- inputs are incomplete
- invoices cannot be generated

### Collecting inputs

The association gathers:

- the applicable Budget Plan
- water readings and calculated charges
- common-water source amount
- gas charges where applicable
- approved additional charges
- ownership responsibility for the period

### Ready for review

- required charge inputs are present
- invoice preview can be calculated
- no invoices have been finalized

### Approved

- an authorized staff member has reviewed the billing inputs
- calculations are approved
- the period is ready for invoice generation

### Invoices generated

- one invoice exists for each eligible permanent Unit Account
- invoice line items preserve their charge source
- invoice addressee is snapshotted from the Owner responsible for the billing cycle
- repeated generation must not create duplicates

### Closed

- the billing run is administratively finalized
- invoices remain payable after the period closes
- payment collection is not required to finish before closing
- historical billing inputs and generated invoices should not be silently rewritten

Reopening should only be considered later as an administrative exception, not as a routine workflow.

## Charge Calculation Model

Invoice calculation should be understood conceptually as follows.

### Monthly budget assessment

`Monthly Assessment Pool × Unit participation percentage / 100`

The exact rounding policy remains unresolved before implementation.

The confirmed calculation is direct and uses the monthly assessment pool without a yearly normalization step.

### Private water

- sourced from the previous month’s measured consumption
- charged to the relevant Unit Account
- exact meter and rate workflow belongs to the Utilities domain

### Common water

- building-level monthly source amount
- applies only to apartment / condo Units
- allocated by each apartment’s participation percentage
- parking and storage are excluded

### Gas

- applies only where gas service exists
- initially treat gas as a defined Unit-specific monthly charge source
- do not assume a dedicated meter subsystem until the Utilities audit proves it

### Additional charges

- positive or negative
- Unit Account-specific
- assigned to a target billing period
- include amount, description, reason or source, and status
- do not alter the Budget Plan or participation percentage

## Invoice Generation

Billing Periods drive monthly invoice generation.

Rules:

- one Billing Period generates at most one invoice per Unit Account
- the invoice is asset-account-specific
- the invoice stores Owner and addressee context at generation time
- changing Ownership later does not rewrite historical invoices
- invoices contain charge line items rather than hardcoded charge columns
- invoice lines link to their Unit Account
- invoice generation must be idempotent
- preview and final generation are separate concepts
- correcting an issued invoice should eventually use adjustment, void, or replacement workflows rather than silent recalculation

## Ownership Responsibility

Responsibility is resolved at the billing-cycle boundary.

The association does not prorate based on mid-cycle property transactions.
The transfer becomes relevant to billing at the agreed cycle boundary.
The responsible Owner for the period becomes the invoice addressee.
The permanent Unit Account and its debt remain unchanged.

The exact cutoff implementation remains part of the Ownership workflow design.

## Payments and Closing

- payments may arrive before or after the Billing Period is closed
- a Billing Period is not a payment batch
- invoice payment status belongs to Invoices and the ledger
- one payment may settle multiple invoices and Unit Accounts
- payment allocation belongs to the Payments domain
- closing a Billing Period does not mean every invoice is paid

## Budget Plan Workflow

The yearly relationship should be:

1. Budget Plan is created
2. Budget Plan is reviewed and approved
3. Monthly Billing Periods reference the approved budget plan
4. Each period calculates the monthly Unit assessment from that approved budget plan
5. If the budget plan changes, the effective-period behavior must be explicitly controlled

Budget revision behavior remains an open design question.

## Domain Relationships

Building
→ Budget Plan
→ Billing Period
→ Invoices
→ Invoice Line Items
→ Permanent Unit Accounts

Supporting inputs:

Units
→ participation percentage

Ownerships
→ responsible Owner for the billing cycle

Meter Readings / Utility Inputs
→ private water and gas charges

Common Utility Bill
→ common-water allocations

Additional Charges
→ targeted Unit Account invoice lines

## Invariants

These are permanent rules for the modern TB810 model:

- one Unit Account per Unit
- one monthly invoice per eligible Unit Account
- no combined multi-asset invoice
- invoice debt belongs to the Unit Account
- Owner is preserved as addressee-at-issue context
- ownership changes do not reset balances
- participation percentage is persisted Unit data
- common water applies only to apartments
- payments do not determine whether a Billing Period may close
- generated invoices must not be duplicated
- closed billing inputs must not be silently altered

## Explicit Exclusions

Billing Period does not:

- create Units
- create Owners
- transfer Ownership
- own the Unit Account balance
- store raw permanent meter identity
- allocate payments
- issue receipts
- calculate NOC eligibility
- combine multiple Unit Accounts into one invoice

## Open Questions

Unresolved decisions:

- exact rounding policy for monthly participation assessment
- exact invoice and due dates
- mandatory inputs before approval
- whether approval is always required
- whether a generated period can be reopened
- how corrections are handled after invoice generation
  - whether budget plan revisions affect future periods only
- exact gas input mechanism
- whether negative additional charges are allowed as direct credits or require a separate adjustment workflow
