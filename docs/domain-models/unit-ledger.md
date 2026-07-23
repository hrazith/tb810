# Unit Ledger Domain

Status: FROZEN

## Purpose

The Unit Ledger is the canonical financial history for a unit.

It stores the immutable chronological record of financial facts that affect that
unit.

## Scope

The Unit Ledger owns:

- immutable financial entries
- historical balance movement
- chronological account history
- derived running balance support

The Unit Ledger does not own:

- billing generation
- invoice presentation
- payment intake
- payment reconciliation
- vendor payables
- dashboards
- AI insights

## Core Principles

- Every unit has exactly one financial account.
- Financial history belongs to the unit.
- Ledger entries are immutable.
- Corrections are represented by new adjusting entries.
- Reports and balances are derived from ledger facts.

## Relationship to Other Domains

Upstream domains create the financial facts.
The Unit Ledger preserves those facts as immutable history.

Examples of upstream facts:

- monthly charges
- water charges
- payments
- credits
- adjustments
- reversals

## Why it matters

The Unit Ledger is the single source of truth for financial history.

Owner-level views are derived by aggregating the unit-level ledger, not by
storing a second competing truth.

