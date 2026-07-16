# TB810 Domain Implementation Roadmap

## Overview

TB810 will be built domain by domain, with each domain moving through the same sequence:

1. legacy audit
2. domain design
3. schema validation and refinement
4. backend implementation
5. UI or workflow implementation
6. QA
7. documentation

This roadmap is ordered by dependency, not by visual priority. A domain appears when the data, rules, and downstream consumers needed for it are ready.

## Current Status

### Foundation

Complete:

- standalone Next.js application
- standalone hosted Supabase project
- authentication
- staff authorization
- RLS
- roles and permissions
- first Super Admin bootstrap
- typed Supabase clients
- append-only migration discipline
- clean baseline schema

### Owners

Complete:

- legacy audit
- modernized domain model
- immutable system-generated owner reference
- backend
- CRUD UI
- validation
- archive lifecycle
- QA documentation
- domain documentation

### Units Schema Foundation

Complete:

- legacy audit
- registered area added
- participation percentage clarified and renamed
- billing adjustment removed from Unit
- Units domain documentation
- fixed inventory decision
- no co-ownership decision
- one permanent Unit Account per Unit decision

## Core Rules That Shape the Roadmap

- TB810 currently manages one building, so no Buildings CRUD is planned for the user-facing application
- the Building remains a first-class database entity and root aggregate
- Owners and Units are separate
- Ownerships connect Owners to Units over time
- registered area belongs to the Unit
- participation percentage is a persisted legal coefficient on the Unit
- participation percentage is not automatically recalculated yet
- there is no co-ownership support
- ownership share is not a required TB810 concept
- debts belong to the asset account, not the owner
- ownership changes do not erase or reset debt
- the incoming owner becomes responsible for the existing asset balance
- condo, parking, and storage are all first-class assets
- Units are a fixed inventory and are not created or archived as a normal workflow
- billing, invoicing, payments, and reconciliation are workflows, not generic CRUD modules

## Domain Sequence

### 1. Units

- Purpose: define the physical/legal asset root for the rest of the model.
- Why here: Ownerships, Unit Accounts, billing, and all asset-linked workflows depend on a stable Unit aggregate first.
- Key dependency: unit type, registered area, participation percentage, and lifecycle rules.
- Definition of done: `/units`, `/units/[unitId]`, and `/units/[unitId]/edit` with list/search/type filtering and metadata editing, with the asset model finalized enough for Ownerships and Unit Accounts to attach to it cleanly.

### 2. Ownerships

- Purpose: model who owns which Unit over time.
- Why here: ownership must sit on top of a stable Unit definition and before any account lifecycle tied to ownership changes.
- Key dependency: Units and Owners.
- Definition of done: ownership history, effective dates, and transfer semantics without mixing in debt or billing logic.

### 3. Unit Accounts

- Purpose: represent the asset-level account/ledger that carries debt across ownership changes.
- Why here: debt and balance behavior must be established before billing and payment workflows expand.
- Key dependency: Units and Ownerships.
- Definition of done: asset-account lifecycle, opening/current balance, ownership handoff behavior, and debt continuity across ownership changes.

### 4. Meter Readings

- Purpose: capture usage inputs that feed utility allocation and invoice calculations.
- Why here: meter data is an input to billing but depends on Units and account context.
- Key dependency: Units and metering capability.
- Definition of done: reading capture, validation, history, and linkage to billing periods or utility bills.

### 5. Billing Periods

- Purpose: define the billing cycle boundary and workflow state for a period.
- Why here: invoicing and allocation need a period container before bill generation begins.
- Key dependency: Building, Units, and account structure.
- Definition of done: billing period lifecycle, approval states, and period-level controls.

### 6. Utility Bills

- Purpose: model supplier-side utility charges that will later be allocated across units.
- Why here: utility bills are upstream inputs to billing and allocations.
- Key dependency: Billing Periods and Suppliers.
- Definition of done: bill capture, attachment, categorization, and period association.

### 7. Invoice Preview and Generation

- Purpose: assemble a draft statement for a Unit/Owner before final posting.
- Why here: invoice logic depends on unit accounts, billing periods, readings, and bill inputs.
- Key dependency: Unit Accounts, Billing Periods, Meter Readings, and Utility Bills.
- Definition of done: preview, generation, and validation of invoice totals before approval or send.

### 8. Payments

- Purpose: record money received against invoices and accounts.
- Why here: payment posting should follow invoice generation and account structure.
- Key dependency: Invoices and Unit Accounts.
- Definition of done: payment capture, posting, allocation, and lifecycle status.

### 9. Reconciliation and Allocations

- Purpose: apply payments and other receipts to invoices, balances, and related charges.
- Why here: reconciliation depends on recorded invoices and payments, not the other way around.
- Key dependency: Payments, Invoices, and Unit Accounts.
- Definition of done: allocation rules, reconciliation states, and auditability of how money was applied.

### 10. Receipts

- Purpose: issue the operational receipt record for payments or reconciled collections.
- Why here: receipts are downstream of payment capture and reconciliation.
- Key dependency: Payments and Reconciliation.
- Definition of done: receipt generation, numbering, and traceable linkage to posted collections.

### 11. Credits and Credit Transfers

- Purpose: manage overpayments, credits, and movement of credit between asset accounts.
- Why here: credits rely on the balance and reconciliation model already existing.
- Key dependency: Unit Accounts, Payments, and Reconciliation.
- Definition of done: credit lifecycle, transfer rules, and balance continuity across unit accounts.

### 12. Reports

- Purpose: summarize operational, billing, and collections data for staff.
- Why here: reporting is most useful after the core workflows exist and can be trusted.
- Key dependency: all prior transactional domains.
- Definition of done: stable staff-facing reports with clear source-of-truth queries.

### 13. Suppliers and Expenses

- Purpose: manage external vendors and expense records that feed utility and maintenance workflows.
- Why here: suppliers support utility bills and expense tracking, which are easier to define after billing primitives exist.
- Key dependency: Utility Bills and Billing Periods.
- Definition of done: supplier records, expense capture, and links to paid or payable operational costs.

### 14. Documents

- Purpose: attach files to owners, units, invoices, payments, bills, and other records.
- Why here: document storage should attach to mature aggregates rather than define them.
- Key dependency: the core business aggregates already being present.
- Definition of done: upload, metadata, association, access control, and lifecycle states.

### 15. Communications

- Purpose: record notices, messages, and operational outreach.
- Why here: communications depend on existing owner, unit, invoice, and payment records as targets.
- Key dependency: Owners, Units, Invoices, and Payments.
- Definition of done: message records, delivery states, and linkage to business events.

### 16. Staff and Permissions Administration

- Purpose: manage operational access and permission assignment within TB810.
- Why here: staff management should follow the core business model, not define it.
- Key dependency: existing auth, roles, and permission primitives.
- Definition of done: staff lifecycle, role assignment, and permission administration UI/workflows.

### 17. Audit Log and Administrative Controls

- Purpose: preserve traceability and administrative oversight across all domains.
- Why here: audit and control surfaces are most valuable once the main workflows exist.
- Key dependency: the rest of the domain model and its transactional events.
- Definition of done: durable audit history, admin review surfaces, and controls for sensitive operations.

## Next Milestone: Units

Units is the next milestone because it establishes the physical/legal asset root that Ownerships, Unit Accounts, and all billing workflows depend on.

### Definition of Done

- `/units`
- `/units/[unitId]`
- `/units/[unitId]/edit`
- list/search/type filtering
- edit
- unit type
- unit number
- floor
- registered area
- participation percentage
- meter capability
- notes
- responsive UI
- RLS-backed access
- QA checklist
- no ownership assignment yet
- no billing or balance editing on Unit
- no Unit creation workflow
- no Unit archival workflow

### Why Units Comes Next

- It is the first unresolved domain that anchors the asset model.
- Ownerships need it.
- Unit Accounts need it.
- Billing depends on it.
- The schema already reflects the modernized Unit boundary, so the remaining work is implementation rather than model invention.

## Guardrails

- never edit an already-applied migration
- every schema change gets a new timestamped migration
- generated Supabase types must be regenerated from the hosted schema
- do not invent fields without legacy, business, or architectural evidence
- do not let page components own business logic
- do not weaken RLS to make the UI work
- avoid premature shared abstractions until reuse is proven
