# Finance Map

Finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This page is retained as a compact conceptual map for reference.

This document captures the conceptual dependency map for the TB810 finance subsystem.

It is not a workflow.
It is not an implementation sequence.
It is a dependency map showing how each domain builds upon the previous one.

## Canonical Finance Sequence

Finance:

- Budget Plan
- Monthly Assessment
- Billing Period
- Monthly Financial Obligations
- Unit Ledger
- Owner Statement
- Invoice / Communication
- Payments
- Payment Allocation
- Reconciliation
- Outstanding Balance
- Delinquency
- Financial Reporting

## Domain Notes

### Budget Plan

The year-scoped administrative record that stores the Monthly Assessment Pool.

### Monthly Assessment

The monthly contribution derived from the Budget Plan and each Unit's participation percentage.

### Billing Period

The operational context for one accounting month.

### Monthly Financial Obligations

The amount every Unit owes for the Billing Period.

### Unit Ledger

The financial history of each Unit.

### Owner Statement

The owner-facing financial view.

### Invoice / Communication

How obligations are communicated.

### Payments

Money received from owners.

### Payment Allocation

How payments satisfy obligations.

### Reconciliation

Matching bank transactions, vouchers, and recorded payments.

### Outstanding Balance

The current financial position of every Unit.

### Delinquency

Late accounts, reminders, and legal escalation.

### Financial Reporting

Association reports, owner reports, audit, and year-end reporting.

## Guiding Principle

Every financial capability should naturally build upon the domains above.

Avoid introducing shortcuts that bypass the architecture.

Examples:

- Budget to obligations
- Obligations to Unit Ledger
- Payments to allocation
- Allocation to reconciliation
- Reconciliation to balance
- Balance to reporting

The Unit remains the accounting anchor throughout the finance system.

## Terminology Note

The pasted finance map used the phrase "Annual Budget Plan" as a shorthand for the year-scoped budget record.

TB810 documentation uses the canonical term Budget Plan for that record, because the monetary amount represents the Monthly Assessment Pool rather than an annual amount.
