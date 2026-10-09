# Units Domain

## Current Live Implementation

The live Units implementation treats Units as the canonical master-data inventory for the building.

Current live behavior:

- Units are a closed inventory and are not created or archived through normal operations;
- Units are imported before Owners in the migration sequence;
- Unit Type drives operational capability;
- operational modules consume Unit Type capabilities rather than hardcoding asset exclusions;
- parking and storage are not excluded by default;
- per-unit capability overrides exist only for genuine exceptions;
- Units feed Ownerships and Unit Accounts downstream.

### Unit configuration and change history (October 8, 2026)

The Unit row is the **current truth**:
- `has_meter` (individual Water meter) and `has_gas_service` are simple current booleans, with no history of their own.
- Changing them can change how historical operational screens (for example the Gas reading ledger) group past readings.
- Persisted approved obligations are not affected.

Editing an existing Unit goes through the transactional `tb810_update_unit` function (migration `20261008130000_unit_change_events`). One save does the following in a single transaction:
- checks the `units.manage` permission;
- locks the Unit;
- applies the rule that only condo Units may have a Water meter or Gas service;
- computes the meaningful field differences on the server. Numeric values are compared by value, so 1.556 equals 1.5560. Blank and NULL text are treated as equal.
- if anything changed, requires a **reason for change**;
- writes the Unit and one `tb810_unit_change_events` row.

A change event records:
- the changes as `[{field, before, after}]`, using stable field keys: `unit_type`, `unit_number`, `floor`, `registered_area_m2`, `participation_percentage`, `has_meter`, `has_gas_service`, `notes`;
- the actor, taken from `auth.uid()` and the active staff profile;
- the reason;
- the time.

A save with no meaningful change writes nothing and needs no reason.

Change history is read-only and append-only:
- staff can read it;
- clients cannot insert, update or delete events;
- a trigger rejects any update, delete or truncate.

The Unit detail page lists it newest first, under **Change history**.

`units.manage` remains `super_admin` only. Building managers can view Units, but are not offered Edit or Add, and are redirected away from the edit and new routes. The database refuses their writes, and the app reports "You are not authorized to manage Units."

Deferred hardening: `scripts/import-units.js` and `scripts/backfill-gas-service-units.js` still write `tb810_units` directly, without history. Blocking direct updates of tracked fields outside `tb810_update_unit` is a future step. Creating a Unit records no history event.

Future product rule, not built: when ownership changes, the Unit's current Water and Gas participation should be shown to the operator for confirmation.

## Frozen Canonical Architecture

### Purpose

A Unit represents a physical/legal asset within Torre Balta 810.

Unit types currently include:

- condo
- parking
- storage

The Unit is the durable asset record. It describes the thing that exists in the building, not who owns it at a given moment.

Each Unit has one permanent financial account. The account is part of the Unit model conceptually, even though it is implemented through separate account tables.

### Core Model

Units are master data.

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

The inventory is closed.

TB810 does not expect Units to be:

- added through normal operations
- deleted through normal operations
- subdivided
- merged
- removed from the property

### Unit Type and Capability

Unit Type defines operational capability.

Operational modules consume those capabilities to determine whether a Unit participates in a given workflow.

Do not hardcode parking or storage exclusions into downstream modules.

Use per-unit capability overrides only for genuine exceptions.

### Relationships

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

### Business Rules

- A Unit may exist without an owner
- ownership may change without changing the Unit
- participation percentage does not change merely because ownership changes
- registered area and participation percentage are separate stored facts
- participation is not automatically recalculated yet
- condo, parking, and storage are all first-class asset types
- debt follows the asset account across ownership changes
- there is no co-ownership support
- a Unit has at most one current owner
- Units are a fixed inventory and are not created or archived as a normal workflow
- operational modules must consume Unit Type capability rather than infer asset exclusions by label
- per-unit overrides are allowed only for genuine exceptions

### Migration Sequence

The canonical migration sequence is:

Units → Owners → Ownerships

Units must exist as master data before Owners and Ownerships are migrated or activated.

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

Legacy notes (imported).

- Purpose: preserve historical comments imported from the legacy `units.comments`.
- Live data: all 66 non-empty values equal the legacy comment exactly. They describe billing adjustments, mostly the May 2026 PEN 22 "Bono empleados" and older "ajuste para mantener cuota" adjustments, not intrinsic Unit facts.
- Not the provenance mechanism: why a Unit changed is recorded in Unit change history, not in `notes`.
- Shown as "Legacy notes (imported)"; the stored values are unchanged.

Open financial follow-up, not solved here: the legacy PEN 22 "Bono empleados" fixed-assessment adjustment (legacy `bill_adjustment`, billed from May 2026) is not represented by any live Unit Charge (`tb810_charges` has 0 rows), although the decided native representation is a grouped PEN 22 Unit Charge for October–December 2026. That needs a separate financial operation. The approved rules are in [`unit-charges.md`](unit-charges.md).

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

## MVP2

The following remain MVP2 candidates:

- dynamic capability inference from richer unit metadata
- broader exception handling for unusual asset participation cases
- additional operational overlays that do not belong in the asset core
