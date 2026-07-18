# Finance Architecture Freeze v1

Status: FROZEN

Date: July 18, 2026

This document is the authoritative statement of the Finance architecture for TB810 Finance Foundation v1.

It supersedes previous discussions, reviews, and exploratory notes.

Future implementation, UI design, and database work must follow this document.

This is not an implementation task.

Do not create migrations.

Do not write SQL.

Do not modify application code.

## Guiding Principles

1. The business must outlive the operator.

Business processes must not depend upon Carlos or any individual administrator.

2. Time is a first-class business actor.

Billing Periods and recurring financial obligations exist because time advances.

Administrators manage those events but do not create them.

3. Model the business, not the software.

Prefer real business concepts over ERP or database concepts.

4. Preserve financial history.

Financial history should never silently change.

Corrections create new historical events rather than rewriting existing ones.

5. The Unit is the accounting anchor.

Financial responsibility belongs to Units.

Owner-facing views are presentation models.

## Frozen Domains

- Organization - top-level business boundary, implicit for the current single-organization deployment
- Property / Building - the real-estate context that owns the Units; TB810 Building remains the practical representation
- Unit - permanent physical and legal asset
- Ownership - historical owner-to-unit relationship and billing responsibility boundary
- Budget Plan - annual configuration that establishes the Monthly Assessment Pool
- Billing Period - operational month created by the passage of time
- Monthly Financial Obligations - first-class persistent record of what each Unit owes for a Billing Period

## Accepted Architectural Decisions

- Organization remains implicit for the current single-organization deployment.
- TB810 Building remains the practical Property representation.
- Ownership is historical and should never overwrite previous ownership relationships.
- Billing Period is identified by Building, Year, and Month.
- Billing Period is an operational context rather than a workflow.
- Monthly Financial Obligations become a first-class persistent business domain.
- Every financial obligation belongs to a Unit.
- Owner statements consolidate obligations but do not own them.
- Other Charges remain attached to the Unit to which they belong.
- Monthly obligations preserve their historical calculation inputs.
- Invoice corrections occur by cancellation and replacement rather than editing.

## Deferred Decisions

The following decisions are intentionally outside Finance Foundation v1:

- Explicit Organization table
- Explicit Property table
- Budget versioning
- Legacy field cleanup
- Advanced reporting
- Payments
- Payment Allocation
- Reconciliation
- Delinquency

## Business Clarifications Still Required

1. Whether common-area damage charges belong directly to an Owner or continue to belong to one of the Owner's Units.
2. How historical obligation corrections should be represented once Carlos explains the real operational scenarios.

These questions are intentionally isolated because they do not block the UI sprint.

## Finance Map

The conceptual Finance Map is:

Annual Budget Plan

↓

Monthly Assessment

↓

Billing Period

↓

Monthly Financial Obligations

↓

Unit Ledger

↓

Owner Statement

↓

Payments

↓

Payment Allocation

↓

Reconciliation

↓

Outstanding Balance

↓

Delinquency

↓

Financial Reporting

This represents conceptual dependency rather than workflow.

## Implementation Boundary

The following activities may now proceed:

- Database changes required by the frozen model
- Finance UI sprint
- Subsequent implementation

Future work should conform to this architecture rather than redefining it.

## Related Documents

- [`docs/architecture/confirmed-business-model.md`](/Users/roon/dev/tb810/docs/architecture/confirmed-business-model.md)
- [`docs/architecture/domain-principles.md`](/Users/roon/dev/tb810/docs/architecture/domain-principles.md)
- [`docs/architecture/finance-map.md`](/Users/roon/dev/tb810/docs/architecture/finance-map.md)
- [`docs/architecture/persistence-review.md`](/Users/roon/dev/tb810/docs/architecture/persistence-review.md)
- [`docs/domain-models/billing-periods.md`](/Users/roon/dev/tb810/docs/domain-models/billing-periods.md)
- [`docs/domain-models/budget-plans.md`](/Users/roon/dev/tb810/docs/domain-models/budget-plans.md)
