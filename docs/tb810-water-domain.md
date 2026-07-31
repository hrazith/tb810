# TB810 Water Domain

Status: FROZEN ARCHITECTURE BASELINE

For the post-Sprint 1A canonical documentation set, start with:

- [`docs/water/01-water-domain-overview.md`](/Users/roon/dev/tb810/docs/water/01-water-domain-overview.md)
- [`docs/water/02-unit-meter-reading-domain.md`](/Users/roon/dev/tb810/docs/water/02-unit-meter-reading-domain.md)
- [`docs/water/04-month-routing.md`](/Users/roon/dev/tb810/docs/water/04-month-routing.md)
- [`docs/water/05-meter-reading-database.md`](/Users/roon/dev/tb810/docs/water/05-meter-reading-database.md)

This document captures the frozen business definition of the water domain for TB810. The live implementation may lag behind this baseline in specific areas, especially around downstream allocation and posting behavior.

## Current Live Implementation

### Water Domain Routes

- `/water` is the Water domain home.
- `/water/{period}` is the Monthly Water Ledger.
- `/water/sedapal` is the Sedapal / common-water CRUD surface.
- `/water/unit-meter-readings` is the Unit Water Meter Readings operational ledger.
- `/water/unit-meter-readings/import` is the import scaffold for unit readings.

These routes support the monthly water workflow as separate operational tools.
Sedapal bills and unit meter readings are captured separately, but both feed the broader monthly Water workflow.

### Unit Water Meter Readings

The Unit Water Meter Readings surface is currently implemented as an operational ledger.

Captured behavior:

- inline Add row;
- autosave on blur or Enter for current-month edits;
- inline editing for current-month rows;
- previous-month rows are read-only;
- no Save button;
- no Cancel button;
- consumption is auto-calculated;
- month selector;
- search;
- import entry point;
- dedicated CRUD routes still exist, but they are no longer the preferred workflow.

Current visible column order:

- Unit
- Current
- Previous
- Consumption
- Reading Date

Field behavior:

- Unit is read-only after creation;
- Previous is read-only;
- Consumption is derived;
- Current is editable;
- Reading Date is editable during the current month.

### Month Selector

Month is now the single context control for the ledger.

The UI currently uses:

- a month heading;
- a caret;
- approximately six visible months in the popover;
- scrolling for older months.

Removed from the page:

- Unit filter;
- Status filter;
- Apply button.

Changing month immediately refreshes the ledger.

### Import

Import is the primary action entry point for the page.

The import route currently routes to the scaffold only.
Excel parsing has intentionally not been implemented yet.

### Canonical Data

`tb810_meter_readings` remains the single source of truth for meter readings.

The Monthly Water Ledger consumes the same canonical records.
There is no duplicate reading model.

## 1. Purpose

The TB810 Water Domain governs the monthly water cycle for the condominium building.

Its purpose is to:

- receive the monthly Sedapal invoice for the building;
- measure private water consumption per condominium;
- allocate shared water across all condominiums;
- generate the monthly owner obligations that arise from that cycle.

Payment collection belongs to another domain. This document covers the business meaning of the water cycle itself, not the later collection or recovery of those obligations.

## 2. Actors

### Guliana

Guliana is the operational owner of the monthly water cycle.

Her responsibilities are:

- receive the Sedapal invoice;
- read all condominium meters;
- enter the monthly meter readings;
- review the monthly water cycle;
- explicitly trigger monthly obligation generation.

Guliana does **not** perform the monthly calculations manually. The system performs the calculations.

### Carlos

Carlos provides administrative oversight for the building’s water process.

Confirmed responsibilities include:

- supporting the business rules for water allocation;
- validating the operational model for shared water and private consumption;
- confirming the monthly workflow with Guliana.

Open question:

- whether Carlos actively approves the monthly cycle in the business process, or primarily acts as an administrative reference point.

### Owners

Owners are the recipients of the generated monthly water obligations.

Their role is to:

- receive the monthly charges produced by the water cycle;
- pay the resulting obligations through the separate collections process.

## 3. Physical Model

The building uses two distinct physical ideas:

- one master Sedapal meter for the building;
- one dedicated water meter for each of the 64 residential condominiums.

The master Sedapal meter represents the building-level water supply and invoice basis.

Each condominium meter represents the private consumption of one residential unit.

## 4. Canonical Navigation

Operations Home:

- `/`

Water Domain:

- `/water`

Monthly Water Ledger:

- `/water/{period}`

Examples:

- `/water/2026-07`
- `/water/2026-08`

The Monthly Water Ledger is the canonical business object for the Water domain.

It contains these workflow sections:

- Sedapal Invoice
- Master Meter
- Unit Meter Readings

The following remain deferred to MVP2:

- Review
- Charge Generation
- Permanent Unit Account Posting

## Frozen Canonical Architecture

### Water Philosophy

Water is composed of multiple operational tools.

Examples:

- Sedapal Bills
- Unit Meter Readings
- Monthly Ledger

These tools support the monthly operational workflow.
The workflow itself is not responsible for data capture.

### Operator Philosophy

Never ask the operator for information the system already knows.

Examples of system-derived data:

- Building
- Reading Month
- Previous Reading
- Consumption
- Audit metadata

### Reading Entry Season

Current calendar month is editable.

Previous months are read-only.
Future months cannot receive readings.

The transition happens automatically on the first day of the new month.

There is:

- no Close Month button;
- no Close Reading Season button;
- no billing-period flag controlling editability.

Time controls editability.

### Continuous Calculation

The system is always calculating.

Consumption is continuously recalculated.
Changing a reading immediately updates dependent calculations.

There is no manual recalculation action.

### Manual Entry

Operator enters:

- Unit
- Reading
- Reading Date
- Notes, when supported by the schema

System derives:

- Building
- Reading Month
- Previous Reading
- Previous Reading Date
- Consumption
- Audit fields

### Excel Template

The agreed v1 template uses required columns only:

- Unit Number
- New Reading

The remaining columns are system-derived where possible.

## 5. Monthly Business Workflow

The monthly water cycle follows this business sequence:

1. Receive the Sedapal invoice.
2. Record the invoice in the Monthly Water Ledger.
3. Record the 64 current meter readings.
4. The system calculates monthly consumption.
5. Guliana reviews the cycle.
6. Guliana explicitly generates the monthly obligations.
7. The water cycle becomes processed.

This is a business workflow, not a technical implementation description.

## 6. Business Concepts

### Common Water Cycle

**Definition**

The monthly building-wide water cycle derived from the Sedapal invoice and the meter readings for the period.

**Purpose**

To establish the monthly water basis that will later be allocated across owners.

**Business meaning**

The cycle represents the building’s monthly water truth for one billing period.

**Current status**

✅ Frozen

### Individual Meter Reading

**Definition**

The reading captured for one condominium’s dedicated water meter for a given month.

**Purpose**

To measure that condominium’s private consumption for the cycle.

**Business meaning**

The reading is the input used to determine the unit’s monthly usage delta.

**Current status**

✅ Frozen

### Private Water Consumption (AGUA)

**Definition**

The portion of water charge attributable to one condominium’s own meter usage.

**Purpose**

To charge each condominium for the water it personally consumed.

**Business meaning**

AGUA is the private consumption component of the monthly water obligation.

**Current status**

✅ Frozen

### Shared Water (AGUA COMUN)

**Definition**

The shared building water cost that is allocated across the condominiums.

**Purpose**

To distribute the remaining Sedapal water cost equally across the 64 residential condominiums.

**Business meaning**

AGUA COMUN is the shared component of the monthly water obligation.

**Current status**

✅ Frozen

Canonical rule:

- Calculate the total of all individually metered water charges.
- Subtract that total from the Sedapal invoice amount.
- Divide the remaining cost equally among the 64 residential condominiums.
- Every residential condominium receives exactly the same AGUA COMUN amount for that billing cycle.

Historical note:

The legacy SQL suggested a participation-based allocation model, but Carlos has confirmed that TB810 vNext intentionally uses an equal allocation across all 64 residential condominiums. This supersedes the earlier implementation hypothesis.

### Monthly Water Obligation

**Definition**

The monthly billable obligation produced after the cycle is reviewed and generated.

**Purpose**

To turn the measured water cycle into owner charges.

**Business meaning**

The obligation is the final monthly financial result of the water cycle.

**Current status**

✅ Frozen

## 7. Responsibilities

| Responsibility | Performed By |
| --- | --- |
| Receive invoice | Guliana |
| Read meters | Guliana |
| Enter readings | Guliana |
| Calculate consumption | System |
| Allocate shared water | System |
| Generate obligations | Guliana |

## 8. Business Invariants

- One Sedapal invoice exists per billing cycle.
- One Common Water Cycle exists per billing cycle.
- One meter exists for each residential condominium.
- Monthly consumption comes from meter deltas.
- Generation is an explicit business event.
- Calculations are system-generated.
- Private consumption and shared water are both part of the monthly water obligation.
- AGUA COMUN is computed by equal division of the remaining Sedapal water cost among the 64 residential condominiums.

## 9. Canonical Live URLs

- `/` is the authenticated operations home.
- `/water` is the Water domain home.
- `/water/{period}` is the Monthly Water Ledger.
- `/water/sedapal` is the Sedapal / common-water CRUD surface.
- `/water/unit-meter-readings` is the Unit Water Meter Readings CRUD surface.

## 10. MVP2

The following remain deferred to MVP2:

- Review
- Charge Generation
- Permanent Unit Account Posting
- document extraction
- richer import automation

MVP2 may store additional supplier ledger facts such as:

- Consumption Period Start
- Consumption Period End
- Invoice Issue Date
- Supplier Billed Month

Do not design or implement MVP2 details in this document.

## 11. Current Implementation Notes

- The Monthly Water Ledger and the Unit Water Meter Readings surface both reuse the canonical reading records stored in `tb810_meter_readings`.
- Unit meter readings are currently entered and edited through the operational UI, with the active reading month derived from the current calendar month.
- The Unit Water Meter Readings workflow does not expose a Building field in the operator form.
- The operator supplies Unit, Reading Date, Current Reading, and optional Notes where supported by the schema.
- The system supplies the previous reading, previous reading date, month context, consumption calculation, and audit metadata.
- Current-month unit rows are editable inline on the ledger page; historical rows are read-only.
- The Unit Meter Readings page is the primary operational ledger.
- The first row functions as an inline creation row.
- The operational ledger is the primary entry experience.
- The dedicated New Reading page is no longer exposed through the UI.
- New records are created through the permanent Add Row.
- Newly created readings are inserted immediately beneath the Add Row.
- Save/Cancel buttons have been replaced with automatic persistence.
- Permanent inline "Saved" statuses were intentionally removed.
- Previous Reading Date is intentionally omitted from the operational ledger to reduce visual noise.
- Current-month edits auto-save on blur or Enter.
- Explicit Save and Cancel buttons were intentionally removed to optimize operational data entry.
- Excel import is intentionally deferred in this slice. The import route exists as a scaffold, but `.xlsx` parsing is not implemented yet.
- Owners receive obligations, but collection belongs to another domain.

## 12. Open Questions

The following details remain unresolved or only partially verified:

- the exact legacy PHP implementation details;
- the exact semantics of any `processed` flags in the legacy system;
- whether Carlos has an active approval step or only business oversight;
- whether the monthly cycle stores intermediate calculations before the final obligations are generated.

These are implementation or workflow details that were not fully recoverable from the business discussion alone.

## 13. Frozen Decisions

| Decision | Status | Notes |
| --- | --- | --- |
| TB810 has a monthly Sedapal-driven water cycle | Frozen | Confirmed by business discussions |
| Guliana enters all condominium meter readings | Frozen | Confirmed by business discussions |
| The system performs all calculations | Frozen | Guliana does not calculate manually |
| The cycle includes private and shared water components | Frozen | AGUA and AGUA COMUN are both part of the billing result |
| Shared water is allocated equally across the 64 residential condominiums | Frozen | Confirmed by Carlos |
| The workflow ends with generated owner obligations | Frozen | Collection itself belongs elsewhere |
| There are 64 residential condominiums in the cycle | Frozen | Confirmed by business context |

## Confirmed vs Inferred

### Confirmed from business discussions

- monthly Sedapal invoice;
- 64 residential condos;
- one dedicated water meter per condo;
- Guliana enters the monthly readings;
- the system performs the calculations;
- the process includes AGUA and AGUA COMUN;
- AGUA COMUN is calculated by dividing the remaining Sedapal water cost equally among the 64 residential condominiums;
- Guliana explicitly triggers obligation generation.

### Strongly inferred from legacy SQL

- the water cycle is persisted as monthly data;
- billing uses separate private and shared components;
- owner obligations are generated from the completed cycle;
- processed flags likely indicate a cycle has already been generated.

### Not fully verified

- exact legacy code path that performs generation;
- exact semantics of the processed flags in the old PHP application.
