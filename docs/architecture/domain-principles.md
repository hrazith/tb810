# TB810 Domain Principles

## Introduction

These principles are intentionally stable.

Features, workflows, and implementation details may evolve, but these principles should rarely change. When future work introduces uncertainty, these principles take precedence over convenience.

This document is intended to function as the constitution of TB810: a permanent statement of the business and architectural rules that shape every future decision.

## Principle 1 - Building is the root aggregate

TB810 currently manages a single condominium, so Building CRUD is intentionally omitted from the user-facing application. Even so, the Building remains the root business entity of the system.

Every Unit belongs to exactly one Building. That relationship is foundational, not optional.

If TB810 later supports multiple buildings, the model should extend from this root rather than replace it. The root aggregate stays the same even if the operational footprint grows.

## Principle 2 - Units are physical and legal assets

A Unit represents a real asset, not a person and not a financial record.

Examples of Units include:

- apartment / condo
- parking
- storage

A Unit exists independently of who owns it. Ownership may change; the Unit remains.

A Unit contains only characteristics that belong to the asset itself, such as:

- unit number
- type
- floor
- registered area
- legal participation coefficient
- meter capability

A Unit does not own financial balances or ownership history.

Each Unit has exactly one permanent Unit Account that carries debt, credits, invoices, payments, and ledger history across ownership changes.

## Principle 3 - Owners are people or legal entities

Owners represent people or organizations.

An Owner may own multiple Units. An Owner may sell Units. An Owner does not carry debt simply because they once owned an asset.

Owners describe identity. Units describe assets.

That separation is permanent and must not be blurred by future features.

## Principle 4 - Ownership is a relationship

Ownership connects Owners and Units.

Ownership changes over time, so ownership is historical by nature. It should never overwrite previous ownership history.

Ownership exists independently from billing. It is a relationship, not a balance, and not the asset itself.

TB810 does not support co-ownership. At any time, a Unit has at most one current owner.

## Principle 5 - Asset accounts own financial history

Financial history belongs to the asset account.

Balances, invoices, payments, credits, adjustments, and outstanding debt all belong to the asset-side financial record, not to the Owner.

Changing ownership must not destroy financial history. Financial history survives ownership transfers and remains attached to the asset.

## Principle 6 - Debt follows the asset

Debt belongs to the asset, not the owner.

When ownership changes, the incoming owner becomes responsible for the outstanding balance. This mirrors the real business process and preserves continuity in the asset account.

This rule is important because it keeps accounting truthful and avoids losing the history that led to the debt. A clean account before purchase matters because the debt does not reset at transfer time.

## Principle 7 - Legal characteristics are distinct from operational characteristics

Legal facts, operational facts, and financial facts must remain separate.

Legal examples:

- registered area
- participation percentage

Operational examples:

- current owner
- active ownership
- billing enabled

Financial examples:

- balance
- invoices
- credits

These concepts must not be mixed together. Each one has its own meaning and its own lifecycle.

## Principle 8 - Participation percentage is a legal coefficient

Participation percentage is a persisted legal value on the Unit.

It is not automatically recalculated. TB810 intentionally stores it.

If the legal derivation formula is later discovered, that may be used for verification, but not as the authoritative source of truth unless the business explicitly decides otherwise.

## Principle 9 - Financial workflows consume domain data

Billing, invoices, payments, credits, receipts, and reports are workflows.

These workflows consume data from the domain model, but they do not define the model. The workflow must adapt to the domain, not distort the domain to satisfy a workflow.

If a workflow needs a concept that does not belong in the core domain, that concept should be modeled carefully rather than hidden inside a transactional shortcut.

## Principle 10 - Domain boundaries matter

Each domain must have one clear responsibility.

Avoid putting the same business concept in multiple places. Avoid duplicate ownership of data. Avoid letting one aggregate quietly absorb another aggregate’s concerns.

The basic boundaries are:

- Units own asset information
- Owners own identity
- Ownerships own relationships
- Accounts own balances
- Billing owns calculations
- Invoices own presentation
- Payments own settlement

One Unit maps to one permanent Unit Account. Account identity does not come from ownership identity.

This separation keeps the model understandable and prevents future confusion about where the source of truth lives.

## Principle 11 - Preserve history

Historical information should be preserved.

Prefer history-preserving states over deletion when records participate in financial or ownership history. Changes should remain traceable.

The goal is not to erase earlier truth. The goal is to represent later truth without losing what came before.

## Principle 12 - Modernization over replication

TB810 is not a recreation of the legacy database.

The goal is to preserve the business knowledge while improving the architecture. Legacy behavior should be respected, but legacy implementation details should not automatically be copied.

Where better domain boundaries exist, prefer them. Modernization should improve clarity, durability, and maintainability without inventing new business rules.

## Guiding Questions

Every future feature should be able to answer these questions clearly:

- Does this belong to the Unit?
- Does this belong to the Owner?
- Is this really part of Ownership?
- Is this a workflow rather than domain data?
- Will this still be true after ownership changes?
- Does this preserve financial history?
- Are we improving the architecture rather than copying the legacy system?
- If this feature disappeared tomorrow, would the underlying business model still make sense?
