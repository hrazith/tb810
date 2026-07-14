# Units Domain

## Purpose

A Unit represents a physical/legal asset within Torre Balta 810.

Unit types currently include:

- condo
- parking
- storage

The Unit is the durable asset record. It describes the thing that exists in the building, not who owns it at a given moment.

## Responsibilities

The Unit aggregate is responsible for:

- asset identity
- building association
- asset type
- physical location
- registered area
- legal participation coefficient
- meter capability
- lifecycle
- operational notes

The Unit aggregate should stay focused on the asset itself. It should not absorb ownership history, financial balances, or billing transactions.

## Fields

### `id`

Primary identifier for the Unit record.

- Purpose: stable internal identity
- Why it exists: every asset needs an unambiguous primary key
- Business meaning: the canonical record reference for the unit aggregate

### `building_id`

Reference to the building that contains the Unit.

- Purpose: place the asset in its building context
- Why it exists: units are scoped to a building
- Business meaning: the unit cannot exist outside a building relationship

### `unit_type_id`

Reference to the asset type.

- Purpose: distinguish condo, parking, and storage assets
- Why it exists: different physical assets share the same unit aggregate
- Business meaning: classifies how the asset participates in operations and billing

### `unit_number`

Human-readable unit number or identifier.

- Purpose: operational and display identity
- Why it exists: staff and owners need a recognizable unit label
- Business meaning: the unit’s public-facing identifier within the building

### `floor`

Floor or level descriptor for the Unit.

- Purpose: physical location
- Why it exists: some units need floor-level placement even when they are not apartments
- Business meaning: the asset’s vertical location in the building

### `display_name`

Optional display label for the Unit.

- Purpose: presentation convenience
- Why it exists: some assets need a friendlier name than the raw unit number
- Business meaning: optional human-friendly label

### `registered_area_m2`

Legally registered area of the asset in square meters.

- Purpose: capture the physical/legal size of the asset
- Why it exists: the legacy audit confirmed that every asset has a registered area, even though the exact participation formula is not yet proven
- Business meaning: stored factual area measurement, nullable until legacy backfill is complete

### `participation_percentage`

Legal participation coefficient used for common expense allocation.

- Purpose: persist the asset’s legal participation in the building
- Why it exists: the legacy system stored `unit_percentage` directly on the unit and no formula was proven from the SQL exports
- Business meaning: the legal coefficient currently used by billing

### `has_meter`

Flag indicating whether the Unit can have a meter.

- Purpose: operational capability
- Why it exists: not every unit type needs metering support
- Business meaning: whether meter-based workflows may apply to the asset

### `notes`

Freeform operational notes about the Unit.

- Purpose: capture non-structured staff context
- Why it exists: legacy records and day-to-day operations often need reminders or clarifications
- Business meaning: flexible notes, not transactional state

### `active`

Lifecycle flag indicating whether the Unit is currently active.

- Purpose: control operational visibility
- Why it exists: units should not be hard deleted once referenced
- Business meaning: active units are in use; inactive units remain for history and traceability

### `legacy_table`

Name of the legacy source table used during migration.

- Purpose: traceability back to the source system
- Why it exists: modernization needs lineage for auditing and backfill validation
- Business meaning: provenance metadata, not business data

### `legacy_id`

Primary key value from the legacy source table.

- Purpose: map a migrated record back to the original source row
- Why it exists: supports reconciliation and future import checks
- Business meaning: provenance metadata, not business data

### `legacy_metadata`

Structured metadata captured from the legacy source.

- Purpose: preserve extra source context that does not belong in the new core model
- Why it exists: helps retain evidence during modernization without polluting the Unit aggregate
- Business meaning: migration trace data, not operational asset state

### `created_at`

Timestamp when the Unit row was created in TB810.

- Purpose: record creation time
- Why it exists: supports auditability and timeline analysis
- Business meaning: when the Unit record entered the current system

### `updated_at`

Timestamp when the Unit row was last updated in TB810.

- Purpose: record modification time
- Why it exists: supports auditability and change tracking
- Business meaning: when the Unit record last changed

## Explicit Exclusions

These do not belong on Unit because they are ownership, billing, accounting, or transaction concerns rather than asset identity:

- owner identity
- ownership dates
- ownership share
- balances
- debt
- invoices
- payments
- credits
- temporary billing adjustments

Asset debt is represented through the asset account or ledger, not as a Unit column.

## Relationships

Building
→ Units
→ Ownerships
→ Unit Accounts

The Unit also relates to:

- meter readings
- documents
- invoices
- payments

Those relationships should be modeled through their own aggregates or transactional records, not by embedding them into the Unit itself.

## Business Rules

- A Unit may exist without an owner
- A Unit should not be hard deleted once referenced
- Units can be inactive
- ownership may change without changing the Unit
- participation percentage does not change merely because ownership changes
- registered area and participation percentage are separate stored facts
- participation is not automatically recalculated yet
- condo, parking, and storage are all first-class asset types
- debt follows the asset account across ownership changes

## Modernization Notes

The first modernization pass intentionally aligned the Unit aggregate with the legacy core model while making the legal/physical boundary explicit.

Decisions made during migration:

- `share_percentage` → `participation_percentage`
- added `registered_area_m2`
- removed `billing_adjustment_amount` from Unit

Why these decisions were made:

- The legacy audit proved that participation is a stored legal coefficient on the asset, not a derived value in the exported SQL
- The asset’s registered area belongs on Unit as a factual physical/legal attribute
- Billing adjustments are operational accounting rules and belong in the billing domain, not on the asset itself
