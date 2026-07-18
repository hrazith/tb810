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

- users select a Billing-effective month
- the server normalizes that month to the first day of the month for storage
- the previous Ownership receives an end date on the final day of the prior month
- the new Ownership begins on the billing-month boundary
- exact legal transfer dates are not captured
- scheduled Ownership is distinct from Current Ownership

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
The incoming Owner becomes responsible for all outstanding Unit Account debt, while historical invoices remain unchanged and no prorating occurs.

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

## Budget Plan

The legacy `Presupuesto` concept is the Budget Plan, a deliberately small year-scoped configuration record.

It stores exactly one business decision:

- Year
- Monthly Assessment Pool

The Monthly Assessment Pool represents the total fixed maintenance amount to be collected every month across all Units.

TB810 establishes a Monthly Assessment Pool for a Budget Plan. Each Unit's Fixed Monthly Assessment is calculated by multiplying the Monthly Assessment Pool by the Unit's participation percentage. The amount is not divided by twelve.

Budget Plan is configuration, not accounting.

Fixed Monthly Assessment is always derived.

Invoices persist the calculated amounts that were billed.

Budget Plans do not persist calculated assessments.

Budget Plans never own participation percentages.

The Budget Plan may be edited, but if invoicing has already begun the legacy system appears to rely on Unit-level adjustments rather than budget versioning. That behavior is documented here as an observation, not a recommended model.

## Billing Period

The Billing Period is the monthly operational clock for TB810.

It collects approved charge inputs, determines the responsible Owner for each Unit Account, generates one invoice per Unit Account, and records the completion state of the monthly billing run.

The Billing Period references the Budget Plan, ownership responsibility, meter inputs, utility inputs, and additional charges. It does not own permanent balances or ownership history.

## Budget Preview

Creating or editing a Budget Plan should eventually lead to a Budget Preview.

The preview calculates the Fixed Monthly Assessment for every Unit.

The preview does not create invoices.

The preview exists to help Carlos validate the Monthly Assessment Pool before continuing.

The exact contents of the preview remain intentionally open until discussed with Carlos.

## Frozen Decisions

- One Budget Plan per calendar year.
- Monthly Assessment Pool is stored.
- Fixed Monthly Assessments are always derived.
- Budget Plans do not store calculated assessments.
- Budget Preview derives assessments.
- Invoices store historical billed amounts.
- Participation Percentages belong to Units.
- Unit inventory is fixed.
- Budget lifecycle intentionally omitted.
- Budget Plan intentionally remains a small aggregate.

## Open Questions for Carlos

1. What information should the Budget Preview contain to help validate the Monthly Assessment Pool?
2. Are Unit-level Fixed Assessment Adjustments still a real business requirement or merely legacy workarounds?
3. Should the Budget Plan become read-only once invoice generation has begun?
4. Does Carlos ever revise the Monthly Assessment Pool after the budget meeting for reasons other than correcting a data-entry mistake?
5. Would category-level operating budget planning be useful in the future, even though it does not exist in the legacy system?

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
