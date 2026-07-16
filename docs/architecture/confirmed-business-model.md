# Confirmed Business Model

## Unit

A Unit is a permanent physical and legal asset.

TB810 supports exactly three Unit types:

- apartment / condo
- parking
- storage

Each Unit:

- can be owned independently
- has its own permanent financial account
- receives its own monthly invoice
- carries its own debt and financial history
- transfers responsibility when ownership changes

There is no co-ownership support.
Each Unit has at most one current owner.
Historical ownership is preserved over time.

## Finite Inventory

The asset inventory is fixed.

TB810 does not expect Units to be:

- added through normal operations
- deleted through normal operations
- subdivided
- merged
- removed from the property

The application needs:

- Unit list
- Unit detail
- Unit metadata editing

## Building

TB810 currently manages one Building.

The Building remains a first-class database entity and root aggregate, but the user-facing application does not need Buildings CRUD.

## Ownership

Ownership is the historical relationship that records which Owner is responsible for a Unit during a defined period.

Ownership changes preserve history:

- the previous ownership receives an end date
- the new ownership begins on the relevant billing-cycle boundary

Ownership transfer is a business workflow, not generic CRUD.

## Unit Account

Each Unit has one permanent Unit Account.

Debt, credits, balances, invoices, and ledger history belong to the Unit Account, not the Owner.

Ownership changes must not:

- create a new zero-balance account
- reset debt
- move debt to a different account
- erase financial history

The incoming Owner becomes responsible for the existing Unit Account.

## Ownership Transfer

Ownership transfer is a business workflow, not generic CRUD.

The transfer closes one Ownership and creates the next without changing the Unit Account or rewriting historical invoices, payments, or receipts.

Billing responsibility is resolved at the billing-cycle boundary from the Ownership active on that period start date.

## Monthly Invoices

TB810 generates one invoice per permanent Unit Account.

If one person owns:

- one apartment
- one parking asset
- one storage asset

that person receives three invoices.

Owner-level reporting may aggregate those invoices for display, but the target system does not combine multiple Units into one invoice.

## Monthly Charge Sources

A Unit invoice may contain charge line items from:

1. Monthly participation-based assessment
2. Previous month’s private water charge, where applicable
3. Previous month’s gas charge, where the Unit has gas service
4. Common water charge for apartment / condo Units
5. Approved one-off additional charges assigned to that Unit Account and billing period

Invoice lines should be modeled as charge types rather than hardcoded invoice columns.

## Annual Budget

The legacy `Presupuesto` concept is the approved Annual Association Budget.

It is the source for the participation-based monthly assessment.

The monthly assessment is calculated from the approved annual budget and the Unit's persisted participation percentage.

## Billing Period

The Billing Period is the monthly operational clock for TB810.

It collects approved charge inputs, determines the responsible Owner for each Unit Account, generates one invoice per Unit Account, and records the completion state of the monthly billing run.

The Billing Period references the Annual Budget, ownership responsibility, meter inputs, utility inputs, and additional charges. It does not own permanent balances or ownership history.

## Participation

Registered area and participation percentage remain operational source-of-truth fields.

TB810 must not automatically recalculate participation percentage from area.

Participation percentage belongs to the Unit.
Ownership share is not required.

## Legacy Behavior Not Being Copied

TB810 will not reproduce legacy multi-asset invoice grouping.

TB810 will not reproduce co-ownership billing behavior.

TB810 will not use ownership rows as the identity of the financial account.

TB810 will not treat Unit creation or Unit archival as a normal business workflow.
