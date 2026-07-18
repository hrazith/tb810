# Billing Periods Domain

The authoritative finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This document remains the domain-model companion for Billing Periods.

The Billing Period domain is architecturally frozen. Downstream activity details remain in their respective domains.

## Purpose

A Billing Period is the operational context for one calendar month.

Examples:

- January 2027
- February 2027

It exists because the calendar exists.

It is not manually created or opened by Carlos.

It is the container and operational context for the month's work.

It is the orchestration context that:

- collects approved charge inputs
- determines the responsible Owner for each Unit Account
- generates one invoice per Unit Account
- records completion state for the monthly billing run

The Billing Period does not own permanent balances, ownership history, payment history, budget plan definition, meter identity, or Owner identity. It consumes or references those domains.

## Responsibilities

The Billing Period aggregate is responsible for:

- period date boundaries
- operational awareness
- traceability of the monthly run
- surfacing blockers, overdue items, exceptions and missing information

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

Operational status of the monthly context.

Current schema values:

- `draft`
- `collecting_readings`
- `ready_for_review`
- `approved`
- `invoices_generated`
- `closed`

These values are current schema fields, but the domain should not be modeled as a workflow state machine.

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
- operational health summary
- blockers
- overdue items
- exceptions
- notes

Some of these are already represented in the current schema, some are likely needed later, and some still require schema review before implementation. This document defines the business shape only.

## Lifecycle

Do not model the Billing Period itself as a traditional workflow state machine.

Do not initially model Draft, Open, Ready, Active, Closed or Archived lifecycle states.

The relevant question is what is preventing the month's activities from progressing.

## Charge Calculation Model

Invoice calculation should be understood conceptually as follows.

### Monthly budget assessment

`Monthly Assessment Pool × Unit participation percentage / 100`

The exact rounding policy remains unresolved before implementation.

The confirmed calculation is direct and uses the monthly assessment pool without a yearly normalization step.

Monthly obligations are immutable financial history.

Once monthly obligations are established they become part of financial history.

The system must preserve:

- monthly assessment amount
- participation percentage
- water calculations
- rates
- calculation inputs
- resulting obligation

Future edits to budgets, ownership percentages or rates must never silently rewrite previous months.

Historical months remain historically correct.

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

## Invoice Corrections

If an invoice mistake is found after sending it, cancel the wrong invoice and send a new one.

Invoices should never be edited after being issued.

Cancelled invoices remain in history.

Replacement invoices are newly issued.

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

## Operational Health

The Billing Period should provide operational awareness.

The system should continuously understand:

- what has been completed
- what remains outstanding
- what requires attention
- what is overdue
- what is blocked
- what data is missing
- what changed recently
- what should be addressed next

The primary question answered by the Billing Period experience is:

What requires attention in this month's operation?

The interface should prioritize exceptions and attention items while still allowing the user to access the underlying records.

## Budget Plan Workflow

The monthly relationship should be:

1. Budget Plan is established
2. Monthly Billing Periods reference the approved Budget Plan
3. Each period calculates the monthly Unit assessment from that approved Budget Plan
4. If the budget plan changes, the effective-period behavior must be explicitly controlled

Budget revision behavior remains an open design question.

## Domain Relationships

Billing Period coordinates monthly work across the core finance domains:

- Building
- Budget Plan
- Unit Accounts
- Ownerships
- Invoices
- Invoice Line Items

Supporting inputs:

- Units
- Meter Readings / Utility Inputs
- Common Utility Bills
- Additional Charges

Monthly assessment relies on the Unit participation percentage.
Ownerships determine the responsible Owner for the billing cycle.
Meter readings and utility inputs feed private water and gas charges.
Common utility bills feed common-water allocations.
Additional charges become targeted Unit Account invoice lines.

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
- exact gas input mechanism
- whether negative additional charges are allowed as direct credits or require a separate adjustment workflow
