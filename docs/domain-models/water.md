# Common Water Ledger

For the Sprint 1A unit meter-reading slice, the canonical documentation set lives in:

- [`docs/water/01-water-domain-overview.md`](/Users/roon/dev/tb810/docs/water/01-water-domain-overview.md)
- [`docs/water/02-unit-meter-reading-domain.md`](/Users/roon/dev/tb810/docs/water/02-unit-meter-reading-domain.md)
- [`docs/water/03-june-2026-import.md`](/Users/roon/dev/tb810/docs/water/03-june-2026-import.md)
- [`docs/water/04-month-routing.md`](/Users/roon/dev/tb810/docs/water/04-month-routing.md)
- [`docs/water/05-meter-reading-database.md`](/Users/roon/dev/tb810/docs/water/05-meter-reading-database.md)

The authoritative finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This document captures the canonical Common Water Ledger design for TB810.

## Water-to-Obligation Timing Model

TB810 distinguishes five different time concepts:

- Service Dates
- Reading Date
- Service Month
- Sedapal Billed Month
- Obligation Month

These concepts are related but not interchangeable.

### Service Dates

Service Dates are the exact range covered by Sedapal's measured water service.

They are the calendar dates between the previous and current master-meter readings.

The canonical service-date fields are conceptually:

- `service_start_date`
- `service_end_date`

### Reading Date

Reading Date is the date of the current master-meter reading.

It is an operational event date.
It is not the Service Month and it is not the Obligation Month.

### Service Month

Service Month is the TB810 accounting attribution month for the water service.

For the approved legacy cadence:

- the Service Month is the month immediately preceding the Reading Date month

Example:

- Reading Date: 06 Jul 2026
- Service Month: Jun 2026

### Sedapal Billed Month

Sedapal Billed Month is the supplier-facing month printed on the bill.

It is preserved for provenance and reconciliation.
It is not the same thing as TB810's Obligation Month.

### Obligation Month

Obligation Month is the TB810 Unit Account billing cycle in which the charge is assessed.

For the approved legacy cadence:

- Water Service Month M
- Obligation Month M + 2

Example:

- Service Month: Jun 2026
- Obligation Month: Aug 2026

### Canonical Timing Rule

A charge may originate from an earlier Service Month while belonging to a later Obligation Month.

TB810 preserves both identities:

- source Service Month
- target Obligation Month

The timing model must remain traceable across:

- Sedapal Utility Bill
- Unit Meter Reading
- Water Consumption Obligation
- Invoice
- Payment

## Current Live Implementation

The live Water implementation is split across two operational surfaces:

- `/water/{period}` for the Monthly Water Ledger
- `/water/unit-meter-readings` for Unit Water Meter Readings

Both surfaces consume the same canonical reading records.

The live Unit Water Meter Readings workflow currently behaves like an operational ledger:

- inline Add row;
- autosave on blur or Enter;
- current-month editing only;
- previous-month rows read-only;
- no Save button;
- no Cancel button;
- month selector as the only ledger context control;
- search and import entry points remain available.

The Month selector is contextual and immediately refreshes the ledger when changed.
The current implementation intentionally removes the older unit/status filter form.

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
- Service Dates
- Previous Reading
- Total Consumption
- Unit Cost
- Charge Month

Building, provider and unit of measure are fixed.

## Terminology

Use these names consistently:

- Service Dates
- Service Month
- Sedapal Billed Month
- Reading Date
- Previous Reading
- Current Reading
- Total Consumption
- Invoice Amount
- Unit Cost
- Charge Month

Do not use "Billed Month".

## Time Semantics

### Consumption Period

The supplier-provided date range covered by the Sedapal invoice.

It may span two calendar months.

This is printed on the invoice as the consumption period and is not the direct MVP1 input for Service Month.

### Reading Date

The end date of the supplier Consumption Period and the date of the current master-meter reading.

In the current data model this may still be stored in `bill_date`, but its business meaning in this workflow is Reading Date.

### Billed Month

Sedapal’s invoice-month label.

It is a supplier label and is not the same as Service Month.

### Service Month

TB810’s accounting attribution month.

MVP1 rule:

`Service Month = start of month(Reading Date) - 1 calendar month`

This means Service Month is the calendar month immediately preceding the Reading Date’s month.

### Charge Month

TB810’s downstream owner-billing month.

MVP1 rule:

`Charge Month = Service Month + 1 calendar month`

For the current workflow this normally matches the Reading Date month and Sedapal Billed Month, but those terms are not interchangeable.

### Canonical Example

- Consumption Period: 05 Jun 2026 – 06 Jul 2026
- Reading Date: 06 Jul 2026
- Billed Month: Jul 2026
- Service Month: Jun 2026
- Charge Month: Jul 2026

### MVP1 Constraint

MVP1 assumes the Sedapal monthly meter-reading cadence remains consistent, so the previous-calendar-month rule is the canonical Service Month derivation.

This is a deliberate operational rule, not a universal utility billing formula.

### MVP2 Note

MVP2 may store Consumption Period Start, Consumption Period End, Invoice Issue Date, and Supplier Billed Month separately so future OCR can derive Service Month from the actual supplier period instead of the simplified previous-month rule.

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

Historical note:

The downstream allocation rule for TB810 vNext is now canonical: the remaining Sedapal water cost is divided equally among the 64 residential condominiums after subtracting all individually metered water charges. This rule lives in the downstream water-allocation and monthly-obligations documentation, not in the supplier-ledger model itself.
