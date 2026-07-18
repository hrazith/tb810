# Persistence Review

The finance architecture referenced here is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This review is retained as a persistence companion to that authoritative architecture.

This review compares the current TB810 persistence model against the finalized domain model for:

- Organization
- Property
- Unit
- Ownership
- Budget Plan
- Billing Period
- Monthly Financial Obligations

It is strictly a database architecture exercise. It does not propose migrations or SQL.

## Overall Observations

- The current schema has solid persistence support for Units, Owners, Ownerships, Unit Accounts, Billing Periods, invoices, and related operational records.
- The current schema does not yet expose dedicated tables for Organization, Property, Budget Plan, or Monthly Financial Obligations.
- `tb810_buildings` is currently carrying the top-level real-estate context, and in practice it is acting as the persistence home for what TB810 needs today.
- The main persistence risk is not lack of relational depth inside the existing finance tables. It is that a few concepts now need clearer aggregate boundaries and first-class historical records.
- The target model can stay small. It does not need a generic enterprise platform shape.

---

## 1. Organization

### 1. Purpose

Persist the top-level business boundary for TB810 and, in the future, support multiple organizations without reworking the finance model.

### 2. Aggregate Root

Organization.

### 3. Tables

- `tb810_organizations`

### 4. Relationships

- Owns the top-level business context for the property administration system.
- Provides the boundary above Property, Units, Ownership, Budget Plan, Billing Period, and Monthly Financial Obligations.
- In the current product, TB810 appears to be operating as a single-organization system with the organization boundary implicit in the app and deployment rather than in a dedicated table.

### 5. Immutable Data

- organization identity
- legal name history if needed
- registration or tax identifiers if the business truly needs them
- source-system provenance

### 6. Mutable Data

- display name
- contact details
- operational notes
- active/inactive state

### 7. Audit Considerations

- creation and archival timestamps
- legal identity changes
- operator/contact changes
- source-system lineage if migrated later

### 8. Future Extension Points

- multi-property support
- organization-scoped permissions
- cross-property reporting
- organization-level settings and communications

### Decision

- Current model: organization boundary is implicit or inherited from the wider product context; no dedicated table exists.
- Target model: add a dedicated Organization table when the system needs the boundary to be explicit in persistence.
- Required before UI sprint: `SAFE TO DEFER` if TB810 remains single-organization for this sprint.
- Migration/backfill: `REQUIRES CARLOS CLARIFICATION` for the exact organization boundary and identity fields, though a future backfill is likely if the table is added later.

---

## 2. Property vs Building

### 1. Purpose

Persist the real-estate asset context that owns the Units.

### 2. Aggregate Root

Property.

### 3. Tables

- `tb810_buildings` as the current persistence home
- `tb810_properties` only if TB810 later proves that Property and Building are distinct concepts

### 4. Relationships

- Owns Units.
- Is the parent context for Ownership, Budget Plan, Billing Period, and Monthly Financial Obligations.
- The current implementation binds Units, Owners, Ownerships, and finance records to `tb810_buildings`.

### 5. Immutable Data

- legal property identity
- original property identifiers
- source-system provenance

### 6. Mutable Data

- property or building display name
- address
- contact details
- tax information
- notes

### 7. Audit Considerations

- address changes
- legal naming changes
- source-system provenance
- management handoff history if the business ever tracks it

### 8. Future Extension Points

- property-level configuration
- property-level documents and notices
- property-level financial summaries
- future multi-property organization support

### Decision

- Current model: one `tb810_buildings` row persists the building/property context for the single Torre Balta 810 site.
- Target model: keep one table only for now. Use `tb810_buildings` as the persistence home unless a second real business distinction appears.
- Required before UI sprint: `SAFE TO DEFER` to a separate Property table. The current model is the smallest correct model.
- Migration/backfill: `SAFE TO DEFER`. If a future Property table is introduced, existing building data would likely be backfilled into it.

---

## 3. Unit

### 1. Purpose

Persist the permanent physical and legal asset that is owned and billed.

### 2. Aggregate Root

Unit.

### 3. Tables

- `tb810_units`
- `tb810_unit_types`

### 4. Relationships

- Each Unit belongs to one Building.
- Each Unit belongs to one Unit Type.
- Each Unit has one permanent Unit Account.
- Each Unit has many Ownership records over time.
- Each Unit can appear in meter readings, documents, invoices, and future finance records.

### 5. Immutable Data

- building association
- unit type
- unit number once accepted as the identity key
- registered area if the business treats it as factual historical data
- legacy provenance fields

### 6. Mutable Data

- floor
- display name
- notes
- has_meter
- active flag if the business still uses it

### 7. Audit Considerations

- type changes
- naming/display changes
- area corrections
- meter capability changes
- provenance of migrated rows

### 8. Future Extension Points

- meter readings
- monthly financial obligations
- unit ledger
- invoices
- documents

### Decision

- Current model: Unit is present and already close to the finalized domain boundary.
- Target model: keep Unit as the core asset aggregate.
- Required before UI sprint: `REQUIRED BEFORE UI` for any UI that depends on a cleaned-up asset model, but not necessarily for every backend simplification.
- Migration/backfill: `REQUIRES CARLOS CLARIFICATION` for any field that is currently legacy-derived but now conceptually owned elsewhere.

### Transitional or Legacy Fields in `tb810_units`

1. `share_percentage`

- Current purpose: stores the legacy participation coefficient on the Unit.
- Target domain fit: yes, but only if TB810 continues to treat it as the persisted legal coefficient.
- Duplicates another relationship: no; it is a Unit field, not an Ownership field.
- Temporary status: can remain if it is the canonical participation field.
- Eventual action: rename conceptually in docs/UI to participation percentage if not already done everywhere.
- Source of truth: the Unit record.

2. `billing_adjustment_amount`

- Current purpose: legacy unit-level financial adjustment carryover.
- Target domain fit: not as a core Unit field.
- Duplicates another relationship: yes, it overlaps with monthly financial obligations and finance corrections.
- Temporary status: may remain temporarily only as a compatibility field while the historical behavior is understood and the finance model absorbs it.
- Eventual action: deprecated and removed once the monthly obligations model or an explicit adjustment model takes over its business meaning.
- Source of truth: the monthly finance layer, not the Unit.

3. `active`

- Current purpose: marks whether the Unit is currently active.
- Target domain fit: only if the business wants a Unit lifecycle flag.
- Duplicates another relationship: potentially yes, because the Unit inventory is fixed and not normally created/archived as a workflow.
- Temporary status: can remain if used operationally.
- Eventual action: likely deprecated or reduced to a narrow operational flag if it is not truly business-significant.
- Source of truth: the fixed Unit inventory rules and any explicit lifecycle policy, not ownership.

---

## 4. Ownership

### 1. Purpose

Persist the historical relationship between an Owner and a Unit over time.

### 2. Aggregate Root

Ownership.

### 3. Tables

- `tb810_ownerships`

### 4. Relationships

- References one Owner.
- References one Unit.
- Determines billing responsibility at the billing-month boundary.
- Drives responsibility lookup for Billing Period and future monthly financial obligations.

### 5. Immutable Data

- owner_id for a specific relationship row
- unit_id for a specific relationship row
- start_date once established
- historical record identity
- provenance fields

### 6. Mutable Data

- end_date while the relationship is being closed
- notes

### 7. Audit Considerations

- the full sequence of ownership changes
- start and end dates
- scheduled versus current ownership state
- source-system lineage
- transfer metadata

### 8. Future Extension Points

- ownership transfer workflow
- billing responsibility lookup
- downstream invoice addressee resolution
- future ownership scheduling rules if ever proven

### Decision

- Current model: the table exists, but it still contains transitional fields from the legacy model.
- Target model: keep a single historical Ownership table with one Owner, one Unit, and explicit start/end dates.
- Required before UI sprint: `REQUIRED BEFORE UI` for ownership-based screens and transfer flows.
- Migration/backfill: `REQUIRES CARLOS CLARIFICATION` only for any remaining historical edge cases; core ownership history already warrants preservation.

### Transitional or Legacy Fields in `tb810_ownerships`

1. `billing_enabled`

- Current purpose: explicit billing participation flag.
- Target domain fit: not needed in the frozen model.
- Duplicates another relationship: yes, because billing responsibility should be derived from the active Ownership row and billing-month boundary.
- Temporary status: may remain only if compatibility requires it during the transition period.
- Eventual action: remove.
- Source of truth: the active Ownership record and its dates.

2. `ownership_share`

- Current purpose: optional ownership share percentage.
- Target domain fit: not required in the frozen model unless co-ownership becomes real.
- Duplicates another relationship: yes, it implies co-ownership logic that TB810 does not support.
- Temporary status: should remain only as a transitional legacy field until the cleanup path is complete.
- Eventual action: remove.
- Source of truth: no target source; the model should not depend on it.

---

## 5. Budget Plan

### 1. Purpose

Persist the annual budget plan that explains how the association determines the amount owners must contribute.

### 2. Aggregate Root

Budget Plan.

### 3. Tables

- `tb810_budget_plans`
- `tb810_budget_plan_versions` if revision history must be first-class
- `tb810_budget_plan_lines` if the plan needs categorized line items

### 4. Relationships

- Belongs to the property/building context.
- Supplies the Monthly Assessment Pool for Billing Periods.
- Can be referenced by the Billing Period that adopted or applied it.
- Does not own ownership history or monthly invoice history.

### 5. Immutable Data

- annual plan identity
- approved or adopted plan version once frozen for a period
- historical line items
- historical Monthly Assessment Pool values
- provenance fields

### 6. Mutable Data

- draft or current-year line items while the plan is being prepared
- Monthly Assessment Pool while the plan is still editable
- approval or adoption metadata if supported by the business

### 7. Audit Considerations

- who entered or revised the plan
- when the plan was adopted or approved
- what version fed each Billing Period
- historical values used for prior months

### 8. Future Extension Points

- budget preview
- annual planning UI
- revision/adoption history
- categorized budget line items

### Decision

- Current model: there is no dedicated Budget Plan table yet.
- Target model: add a Budget Plan root with optional versioning and line items if the business needs them.
- Required before UI sprint: `REQUIRED BEFORE UI` only if the finance UI will surface budget creation or preview; otherwise `SAFE TO DEFER` for the deeper versioning structure.
- Migration/backfill: `REQUIRES CARLOS CLARIFICATION` because the legacy data must be interpreted as either plan rows or plan versions before any backfill is designed.

### Recommended Persistence Shape

The smallest correct target model is:

- one annual Budget Plan record
- optional plan line items
- one adopted version or revision reference for the period if the business needs change history

That is enough to explain the Monthly Assessment Pool without turning Budget into a general-purpose accounting module.

---

## 6. Billing Period

### 1. Purpose

Persist the operational month created by the passage of time.

### 2. Aggregate Root

Billing Period.

### 3. Tables

- `tb810_billing_periods`

### 4. Relationships

- Belongs to a building/property context.
- References the Budget Plan used for the month.
- Provides the monthly boundary for Ownership responsibility.
- Drives monthly financial obligation generation.
- Links to invoices generated for that month.

### 5. Immutable Data

- `building_id`
- `period_year`
- `period_month`
- `starts_on`
- `ends_on`
- historical month identity
- any month that has already produced downstream history

### 6. Mutable Data

- operational notes
- approval notes
- blocker or exception summaries if the UI needs them
- derived operational indicators if they are stored at all

### 7. Audit Considerations

- when the month was prepared
- when it was approved
- when it generated invoices
- when it was closed
- what blockers or missing inputs affected that month

### 8. Future Extension Points

- monthly operational dashboard
- invoice generation controls
- exception tracking
- month-level finance health indicators

### Decision on Existing Status Values

The current status values in `tb810_billing_periods` should be classified as follows:

- `draft` - preserve temporarily for compatibility
- `collecting_readings` - preserve temporarily for compatibility
- `ready_for_review` - preserve temporarily for compatibility
- `approved` - preserve temporarily for compatibility
- `invoices_generated` - derive operationally
- `closed` - derive operationally

Rationale:

- The Billing Period is not a Draft → Open → Closed workflow in the business model.
- The month exists because time advances, not because a staff member opens it.
- Some of the current status values may still be useful as compatibility markers while the UI and downstream domains are finished.
- The lifecycle should not be treated as the domain definition.

### Natural Identity and Uniqueness

A Billing Period is naturally identified by:

- building
- calendar year
- calendar month

That is already the correct uniqueness boundary.

### Dates Belonging to the Billing Period

- `starts_on`
- `ends_on`
- any invoice or due dates that are derived from the month

### Mutable vs Immutable Summary

- The month identity should be immutable.
- Operational notes may change.
- Derived operational status may change.
- The month should not be redefined after it has produced historical financial records.

### Decision

- Current model: a Billing Period row exists and is keyed by building plus calendar month.
- Target model: keep the table, but stop treating its status column as the domain's primary identity.
- Required before UI sprint: `REQUIRED BEFORE UI` if the month dashboard needs to show operational context correctly.
- Migration/backfill: `SAFE TO DEFER` for status cleanup, because it can be done as a compatibility follow-up if needed.

---

## 7. Monthly Financial Obligations

### 1. Purpose

Persist the immutable monthly charges owed by each Unit for a specific Billing Period.

### 2. Aggregate Root

Monthly Financial Obligations.

### 3. Tables

- `tb810_monthly_financial_obligations`
- `tb810_monthly_financial_obligation_lines` if the business later needs obligation composition broken out separately

### 4. Relationships

- References one Billing Period.
- References one Unit.
- References the Unit Account for debt continuity.
- Can later feed invoice line creation.

### 5. Immutable Data

- billing period reference
- unit reference
- obligation type
- calculated monthly assessment
- participation percentage used for the calculation
- utility inputs used for that month
- rate inputs used for that month
- descriptions and business context
- resulting obligation amount
- source metadata

### 6. Mutable Data

- ideally none after creation
- correction or reversal metadata if the business chooses to preserve a correction trail

### 7. Audit Considerations

- exact inputs used to calculate each obligation
- calculation timestamp
- who approved the monthly run if approval exists
- any correction, reversal, or replacement trail
- how the obligation relates to the invoice that later communicated it

### 8. Future Extension Points

- invoice line generation
- statement presentation
- payment allocation
- reconciliation
- balance roll-forward

### Decision on Persistence Shape

- A single generic obligation table is sufficient as the core persistence model.
- Obligation-type-specific detail tables are not required yet.
- Structured columns should store the common business facts that all obligations share.
- JSON may be used only for supplemental provenance or rare extension data, not as the primary business model.
- Calculated obligations and manually entered charges should share one aggregate because they both represent Unit-based monthly obligations.

### Corrections and Adjustments

- Obligation cancellation/replacement should be representable now at least as historical metadata.
- Silent rewrite of prior months should not be allowed.
- If the business needs correction records, they should be modeled as new historical rows or linked reversal rows, not in-place edits.

### Owner-Level Common-Area Exception

The unresolved owner-level common-area damage charge should not weaken the Unit-based model now.

Smallest extension point:

- keep the core obligation anchored to the Unit Account
- allow an obligation source/category to identify a special charge type
- if Carlos confirms a future owner-level exception, add a separate source reference later rather than changing the core aggregate boundary now

### Decision

- Current model: no dedicated obligations table exists.
- Target model: add one generic Monthly Financial Obligations table with clear source and correction metadata.
- Required before UI sprint: `REQUIRED BEFORE FINANCE IMPLEMENTATION`, and `REQUIRED BEFORE UI` if the finance UI will expose monthly charges or previews.
- Migration/backfill: `REQUIRES CARLOS CLARIFICATION` because historical monthly obligation records will likely need to be reconstructed from legacy evidence if they are to become first-class history.

---

## Cross-Domain Persistence Notes

### Immutable vs Mutable

The target model implies three different persistence styles:

- truly immutable historical records
- mutable current-state records
- configuration records that are mutable until a business cutoff, then effectively historical

Examples:

- Ownership should behave like historical state with append/close semantics.
- Billing Period should behave like monthly context, not a workflow ledger.
- Budget Plan should behave like annual configuration with versioned or adopted historical output.
- Monthly Financial Obligations should behave like immutable history.

### Aggregate Boundary Guidance

- Organization is the top-level business context.
- Property is the real-estate context.
- Unit is the permanent asset.
- Ownership is the relationship history.
- Budget Plan is annual configuration.
- Billing Period is the month container.
- Monthly Financial Obligations is the monthly historical charge record.

### Future Finance Extension Points

The frozen domains stop before Payments, Payment Allocation, Reconciliation, Reporting, and Delinquency, but the persistence design should anticipate those joins.

Likely future connection points:

- Unit Account for balance and history
- Monthly Financial Obligations for charge source history
- Billing Period for monthly grouping
- Invoice for communication and issue history
- Ownership for responsible-owner resolution

### Existing Data and Backfill Risk

- Organization: likely no immediate backfill needed if the app remains single-organization, but future explicit support will require a new record.
- Property: if `tb810_buildings` is kept as the property home, no migration is needed now.
- Budget Plan: existing legacy budget evidence will likely require reconstruction into a proper annual plan and historical versions later.
- Billing Period: current rows can remain, but their status semantics may need cleanup or compatibility mapping.
- Monthly Financial Obligations: existing historical amounts will likely need backfill or reconstruction if TB810 wants this domain as durable history before or alongside the finance UI.
- Unit and Ownership transitional fields can be cleaned later, provided the current model keeps the expected relationships intact.

---

## Proposed Target Persistence Model

### Organization

- Conceptual table name: `tb810_organizations`
- Business purpose: top-level business boundary for TB810
- Aggregate/domain owner: Organization
- Key relationships: parent of Property or Building context; boundary for finance and permissions
- Immutable historical responsibilities: organization identity, legal lineage, provenance
- Already exists: no
- Requires modification: no current table exists, so this is a new table if adopted
- New: yes
- Required before the UI sprint: `SAFE TO DEFER` for a single-organization UI sprint

### Property / Building

- Conceptual table name: `tb810_buildings` for now
- Business purpose: real-estate context that owns the Units
- Aggregate/domain owner: Property
- Key relationships: parent of Units, Ownership, Budget Plan, Billing Period, and monthly finance records
- Immutable historical responsibilities: real-estate identity, provenance
- Already exists: yes
- Requires modification: maybe, but not required before the UI sprint unless the business proves Property and Building must split
- New: no
- Required before the UI sprint: `SAFE TO DEFER`

### Unit

- Conceptual table name: `tb810_units`
- Business purpose: permanent physical/legal asset
- Aggregate/domain owner: Unit
- Key relationships: belongs to Building; owns one permanent Unit Account; has many Ownership rows over time
- Immutable historical responsibilities: asset identity, registered area, participation percentage if treated as legal fact, provenance
- Already exists: yes
- Requires modification: yes, only for cleanup of legacy carryover fields if the UI or finance model needs it
- New: no
- Required before the UI sprint: `REQUIRED BEFORE UI`

### Ownership

- Conceptual table name: `tb810_ownerships`
- Business purpose: historical owner-to-unit relationship
- Aggregate/domain owner: Ownership
- Key relationships: Unit, Owner, Billing Period, Unit Account responsibility
- Immutable historical responsibilities: start/end history, responsible-owner trail, provenance
- Already exists: yes
- Requires modification: yes, mainly for cleanup of transitional fields and any constraint tightening
- New: no
- Required before the UI sprint: `REQUIRED BEFORE UI`

### Budget Plan

- Conceptual table name: `tb810_budget_plans`
- Business purpose: annual plan that establishes the Monthly Assessment Pool
- Aggregate/domain owner: Budget Plan
- Key relationships: Property/Building, Billing Period, annual versions or revisions
- Immutable historical responsibilities: plan adoption history, line-item history, monthly pool history
- Already exists: no
- Requires modification: n/a
- New: yes
- Required before the UI sprint: `REQUIRED BEFORE UI` only if budget UI work is in scope; otherwise `SAFE TO DEFER`

### Billing Period

- Conceptual table name: `tb810_billing_periods`
- Business purpose: operational month created by the passage of time
- Aggregate/domain owner: Billing Period
- Key relationships: Building, Budget Plan, Ownership, Monthly Financial Obligations, invoices
- Immutable historical responsibilities: month identity, month boundaries, historical downstream records
- Already exists: yes
- Requires modification: yes, mainly to stop over-reading workflow states as the domain definition
- New: no
- Required before the UI sprint: `REQUIRED BEFORE UI`

### Monthly Financial Obligations

- Conceptual table name: `tb810_monthly_financial_obligations`
- Business purpose: immutable monthly charges owed by each Unit for a Billing Period
- Aggregate/domain owner: Monthly Financial Obligations
- Key relationships: Billing Period, Unit, Unit Account, future invoice line generation
- Immutable historical responsibilities: calculation inputs, obligation amounts, source context, correction history
- Already exists: no
- Requires modification: n/a
- New: yes
- Required before the UI sprint: `REQUIRED BEFORE FINANCE IMPLEMENTATION`

## Concise Summary

### Architecture decisions now ready to freeze

- `tb810_buildings` can remain the persistence home for the current Property/Building concept unless the business proves a real split.
- Ownership should remain a single historical relationship table with one owner and one unit per row.
- Billing Period should remain month-based, keyed by building plus calendar month, not a draft/open/closed workflow.
- Monthly Financial Obligations should be a first-class historical record anchored to Billing Period and Unit Account.

### Unresolved decisions

- whether Organization needs a dedicated table before the UI sprint or can remain implicit for now
- whether Property must split from Building in TB810’s persistence model
- how much Budget Plan versioning and line-item detail the business needs
- whether billing-period compatibility statuses should be removed immediately or preserved temporarily
- whether monthly obligation corrections should be tracked as reversal rows or a separate correction history pattern

### Database changes required before UI

- preserve or formalize the current Unit and Ownership boundaries
- keep `tb810_billing_periods` keyed by building plus calendar month and stop relying on workflow state as the domain identity
- add the persistence shape for Monthly Financial Obligations if the UI will show monthly charges or billing previews

### Database changes that can safely wait

- explicit Organization table
- explicit Property table separate from Building
- deeper Budget Plan versioning and line-item tables if budget UI is not part of the immediate sprint
- cleanup of legacy compatibility fields in Units and Ownerships, unless a specific UI path needs them removed now
