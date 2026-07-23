# Expense Management Domain

Status: FROZEN

## Purpose

Expense Management records money the organization owes to vendors.

It is accounts payable.

This domain is separate from the Unit Ledger and from unit receivables.

## Scope

This domain owns:

- vendors / suppliers
- incoming vendor invoices
- expense obligations
- payment preparation records
- supporting documents for payables

This domain does not own:

- unit charges
- owner receivables
- unit ledgers
- payments received from owners
- reconciliation of owner payments
- reporting balance calculations

## Business Objects

### Supplier

A party that provides goods or services to the organization.

Examples:

- utility providers
- maintenance vendors
- contractors
- cleaning providers
- security providers

### Vendor Invoice

A bill received from a supplier.

It is the trigger for an expense obligation.

### Expense Obligation

An amount the organization owes.

It remains outstanding until the Accounts Payable workflow settles it.

## Domain Responsibilities

Expense Management is responsible for:

- recording vendor invoices
- creating payable obligations
- tracking open obligations
- preparing payment cycles
- preserving supporting documents

It is not responsible for:

- sending money
- owner billing
- unit accounting
- financial reporting
- forecasting

## Key Principle

Expense Management is accounts payable.

Unit Ledger and unit obligations are accounts receivable.

Do not merge these concepts.

