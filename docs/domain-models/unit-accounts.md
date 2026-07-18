# Unit Accounts Domain

The authoritative finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This document remains the domain-model companion for Unit Accounts.

## Purpose

A Unit Account is the permanent financial record for a Unit.

It carries the asset's debt, credits, invoices, payments, and ledger history across ownership changes.

The account belongs to the Unit, not to the current owner.

## Responsibilities

The Unit Account aggregate is responsible for:

- asset-level balance tracking
- invoice linkage
- payment linkage
- credit tracking
- ledger history
- current responsibility state
- lifecycle status

The Unit Account must remain attached to the same Unit for its entire life.

## Core Rules

- each Unit has exactly one permanent Unit Account
- the account is created once and then reused
- ownership changes do not create a new account
- ownership changes do not reset debt
- ownership changes do not erase history
- the incoming owner becomes responsible for the existing balance
- historical invoices and payments keep their original event context

## Identity

The Unit Account identity is the Unit identity.

The account's meaning comes from the Unit it belongs to, not from who currently owns the Unit.

An account may carry a human-readable account number, but the account number is not the business identity.

## Current Responsibility

The account may track the currently responsible owner as a convenience for workflow and reporting.

That responsibility is derived from the active ownership relationship and should be treated as current state, not historical identity.

If the active ownership changes, the responsible-owner view changes, but the account itself remains the same.

## Lifecycle

1. create the Unit
2. create the permanent Unit Account
3. post invoices, payments, credits, and ledger events to that account
4. transfer ownership without replacing the account
5. continue using the same account for the Unit's future financial history

The account may become inactive only if the Unit itself is retired from the asset inventory, which is not a normal operational workflow in TB810.

## Relationships

The Unit Account is the parent financial record for:

- invoices
- invoice line items
- payments
- payment allocations
- account transactions
- credits
- credit transfers
- receipts
- documents tied to account activity

These records should reference the Unit Account directly.

## Explicit Exclusions

The Unit Account does not own:

- owner identity
- ownership dates
- ownership share
- building governance
- unit metadata

Those belong to Owners, Ownerships, and Units respectively.

## Operational Meaning

The Unit Account is the system's source of truth for:

- whether the Unit has outstanding debt
- whether the Unit has credit
- whether the Unit is clear for NOC purposes
- whether a payment or invoice belongs to the asset's financial history

## Architectural Note

The Unit Account exists so TB810 can model asset-based debt correctly.

The account is permanent because the asset is permanent.
Ownership changes affect who is responsible, not which account holds the financial history.
