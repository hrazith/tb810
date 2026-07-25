# Common Water Ledger

The authoritative finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This document captures the canonical Common Water Ledger design for TB810.

## Purpose

The Common Water Ledger represents the monthly supplier Sedapal invoice and the master building water meter reading.

It is the authoritative supplier record from which downstream calculations are derived.

It is not responsible for:

- Common Consumption allocation
- Unit Water Charges
- Monthly Obligations
- Financial Adjustments

Those are downstream domains.

## Business Workflow

Every month:

Sedapal issues invoice
↓

Giuliana enters Common Water Ledger
↓

System derives calculated values
↓

Record reviewed
↓

Month closes
↓

Record becomes immutable

## MVP1 Assumptions

- TB810 records exactly one Sedapal invoice every service month.
- The monthly sequence is uninterrupted.
- Previous Reading is inherited from the previous month's Current Reading.
- Previous Reading is editable only for the very first ledger record.
- Once a service month closes, the record becomes immutable.
- Historical records are never edited.
- Corrections after lock are outside MVP1.
- Missing service months are outside MVP1.

## Data Entry Philosophy

Only supplier facts are manually entered.

User enters:

- Reading Date
- Current Reading
- Invoice Amount

System derives:

- Service Month
- Previous Reading
- Total Consumption
- Unit Cost
- Charge Month

Building, provider and unit of measure are fixed.

## Terminology

Use these names consistently:

- Service Month
- Reading Date
- Previous Reading
- Current Reading
- Total Consumption
- Invoice Amount
- Unit Cost
- Charge Month

Do not use "Billed Month".

## Record Lifecycle

Current Service Month

- editable

Historical Service Months

- immutable

No historical editing.

## MVP2 Backlog

### Missing Service Months

Potential future capability:

- detect skipped service months
- continuity estimation
- configurable estimation strategies
- adjustment workflow
- Operational Intelligence predictions
- preserve audit history

Do not design or implement MVP2 here.

## Design Principles

- Supplier facts should never be fabricated.
- Derived values should be computed whenever possible.
- Historical supplier records become immutable.
- Missing operational data should not halt the business forever, but this capability belongs to MVP2.

## Legacy Implementation Context

Legacy water-related tables included:

- `meters`
- `utilities`
- `utility_types`
- `maintenance_bills`
- `detail_bills`
- `payments`
- `detail_payments`
- `detail_payment_maintenance_bill`
- `media`

The legacy model also used:

- `units.unit_percentage` for participation
- `units.has_meter` for meter capability
- `units.bill_adjustment` for historical adjustment behavior

## Canonical Notes

This document intentionally stops at the supplier-ledger boundary.

It does not define:

- unit allocation formulas
- monthly obligation generation
- payment settlement
- adjustment posting rules
- billing-period orchestration
