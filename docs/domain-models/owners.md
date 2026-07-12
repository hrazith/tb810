# Owners Domain

## Purpose

An Owner represents the legal person or entity that owns one or more condominium units in Torre Balta 810.

An Owner is the business actor behind ownership, billing responsibility, and the long-term relationship to the property. The Owner is the root of identity for the person or entity that appears across the rest of the condo administration workflow.

An Owner is not:

- a Unit
- an Ownership
- a Unit Account
- a Billing Account

Those are separate business concepts and should not be collapsed into the Owner aggregate.

## Responsibilities

The Owner aggregate is responsible for:

- owner identity
- contact information
- lifecycle state
- relationship to ownerships

The Owner aggregate should remain focused on who the owner is and how to contact them. It should not directly own financial data such as balances, invoices, payments, or receipts.

Financial information belongs to downstream billing and accounting aggregates that reference the owner as needed.

## Fields

### `id`

Primary identifier for the Owner record.

- Purpose: stable internal identity
- Why it exists: every owner needs an unambiguous primary key
- Business meaning: the canonical record reference for the owner aggregate

### `full_name`

The owner’s display and legal name as stored in the system.

- Purpose: human-readable owner identity
- Why it exists: owners need a name to appear in lists, details, invoices, and relationships
- Business meaning: the main label for the legal person or entity

### `email`

Primary contact email for the owner.

- Purpose: communication and lookup
- Why it exists: many owners can be contacted by email for notices and follow-up
- Business meaning: optional communication channel for the owner

### `phone_number`

Primary contact phone number for the owner.

- Purpose: communication and lookup
- Why it exists: owners are often contacted by phone for operational or billing questions
- Business meaning: optional communication channel for the owner

### `owner_reference`

System-generated owner reference.

- Purpose: concise identifier for staff workflows
- Why it exists: the legacy initials-based web code is being replaced by a stable database-generated reference
- Business meaning: immutable owner identifier used for staff workflows, search, and cross-record reference

### `notes`

Freeform notes about the owner.

- Purpose: capture non-structured information that staff need to remember
- Why it exists: legacy owner records included comments and operational notes
- Business meaning: flexible staff-facing context, not a transactional field

### `active`

Lifecycle flag indicating whether the owner is currently active or archived.

- Purpose: control whether the owner is operationally current
- Why it exists: owners should not be hard deleted from the system
- Business meaning: active owners are in use; inactive owners remain for history and traceability

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
- Why it exists: helps retain evidence during modernization without polluting the owner aggregate
- Business meaning: migration trace data, not operational owner state

### `created_at`

Timestamp when the owner row was created in TB810.

- Purpose: record creation time
- Why it exists: supports auditability and timeline analysis
- Business meaning: when the owner record entered the current system

### `updated_at`

Timestamp when the owner row was last updated in TB810.

- Purpose: record modification time
- Why it exists: supports auditability and change tracking
- Business meaning: when the owner record last changed

## Explicitly Excluded

These do not belong on Owner because they are billing, accounting, or relationship concepts outside the owner identity aggregate:

- invoices
- payments
- receipts
- balances
- ownership percentage
- billing flags
- units
- documents/identity numbers

The modernization audit found that the legacy TB810 `owners` table supported name, contact information, code, active state, and comments, while ownership relationships lived separately in `owner_unit`. Financial and unit-related concerns were handled in other tables and should continue to stay outside the Owner core.

Identity document fields such as `document_type` and `document_number` were removed during modernization because the audit found no evidence that the legacy TB810 owner model genuinely depended on them.

The legacy initials-based web code was not preserved as the primary identifier. The new `owner_reference` is database-generated, immutable, unique, and safe to use as the long-term owner reference.

## Relationships

Owner
↓

Ownerships

↓

Units

An Owner can have one or more Ownership records. Each Ownership links the owner to a unit and captures the ownership relationship as a separate aggregate.

The Owner also connects indirectly to:

- Payments
- Invoices
- Receipts

These relationships occur through other aggregates and billing records, not by placing financial fields on the Owner itself.

## Business Rules

- Owners cannot be hard deleted
- Owners may be archived
- Owner reference is unique and immutable
- Contact fields are optional
- Full name is required

These rules preserve the owner record as a durable business entity while allowing the system to reflect lifecycle changes without losing historical identity.

## Modernization Notes

The first modernization pass intentionally kept the Owner aggregate aligned with the legacy core model while normalizing field names and removing speculative additions.

Decisions made during migration:

- `name` → `full_name`
- `comments` → `notes`
- `active` normalized to boolean
- `code` was replaced by `owner_reference`
- removed `document_type`
- removed `document_number`
- removed editable code behavior

Why these removals were made:

- The modernization audit found no evidence in the legacy TB810 database that owner identity documents were a supported part of the business model.
- Keeping speculative identity fields would create false business assumptions and risk future data dependencies on fields that were never part of the legacy source of truth.
- The Owner aggregate should stay small and durable, with identity-document concerns modeled separately only if the business explicitly needs them later.
- The owner reference was moved to a system-generated, immutable database value so it no longer depends on human-generated initials or staff entry.

## Future Considerations

The Owner aggregate may eventually need additional capabilities, but those should be modeled in separate aggregates instead of being added directly to the owner core.

Potential future capabilities:

- multiple contacts
- mailing addresses
- tax identities
- document vault
- communication preferences

These belong in separate aggregates because they represent different business concerns:

- multiple contacts are a contact management concern
- mailing addresses are an address/contact concern
- tax identities are a compliance concern
- document vault is a records/document concern
- communication preferences are a messaging/notification concern

Keeping them separate will help preserve the simplicity of the Owner aggregate and avoid rebuilding the same overgrown model the modernization is trying to replace.
