# Monthly Obligations

Status: Frozen concept document

Date: August 5, 2026

This document freezes the Monthly Obligation concept before implementation.

It is the canonical architecture reference for the progressively building monthly unit obligation truth.

## 1. Purpose

A Monthly Obligation is the current financial truth for one Unit in one obligation month.

It is the monthly financial record that composes all known obligation components for that Unit and month.

The Monthly Obligation exists so TB810 can expose a live month-level financial truth before all upstream facts are complete, while still preserving a frozen historical snapshot once the month is finalized.

## 2. Definitions

### Monthly Obligation

The current financial truth for one Unit in one obligation month.

It may be incomplete while upstream facts are still arriving.

### Finalized Monthly Obligation

The immutable historical snapshot of a Monthly Obligation after the month is finalized.

### Obligation Month

The TB810 monthly financial period to which the obligation belongs.

Obligation Month is not the same thing as Reading Month, Service Month, or Sedapal Billed Month.

### Component

A named financial contribution that participates in the Monthly Obligation total.

### Known Total

The sum of all currently available component amounts.

Known Total may change while the Monthly Obligation is live.

### Readiness

The completeness state of the Monthly Obligation for the month.

Readiness reflects whether the obligation is complete enough for downstream use, including invoice generation.

### Blocker

A missing dependency or unresolved condition that prevents a component from becoming available or prevents the monthly obligation from being finalized.

## 3. Progressive Build-Up Lifecycle

The Monthly Obligation is intentionally progressive.

At the start of the obligation month, TB810 exposes the obligation using every financial truth already available.

As additional upstream facts arrive, the obligation accumulates more components.

Example progression:

1. Fixed Monthly Assessment may be available immediately.
2. Metered Water may appear after the Sedapal bill is entered and the water facts are complete.
3. Common Water may appear after meter readings and the Sedapal bill are both available.
4. Gas may appear after its supplier input or allocation facts are available.
5. Other Charges may appear once approved.

The obligation must expose:

- available components
- missing components
- known total
- completeness or readiness state
- blockers for missing components

Missing must never be treated as zero.

A genuine zero amount must remain distinguishable from a missing component.

## 4. Current vs Finalized

### Current

Before finalization, the Monthly Obligation is live.

It reflects current source facts.

Components may appear, disappear, or change as upstream facts are completed or corrected.

The known total may change.

Invoices may remain blocked while required components are missing.

### Finalized

After finalization, the Monthly Obligation becomes an immutable historical financial snapshot.

Invoice generation uses the finalized obligation.

Later source corrections must not silently rewrite the finalized month.

Corrections require an explicit adjustment, replacement, reversal, or future-period correction path.

## 5. Component Contract

Each component in a Monthly Obligation must include:

- stable component key
- label
- status
- amount when available
- currency
- source period or month
- source provenance
- blocker or unavailable reason when missing

Initial component keys:

- `fixed_assessment`
- `metered_water`
- `common_water`

Future component keys:

- `gas`
- `other_charge`

Component status values are conceptually:

- available
- missing
- blocked
- finalized

The exact storage representation is implementation-specific and is intentionally not defined here.

## 6. Month Relationships

Monthly Obligation Month is the month in which the obligation is assessed.

It must remain distinct from upstream timing concepts:

- Budget Plan year
- Water Service Month
- Sedapal Billed Month
- Reading Month

The Monthly Obligation may consume facts that originate in different source months.

For example:

- Fixed Monthly Assessment is sourced from the active Budget Plan and participation percentage.
- Metered Water may be sourced from a prior Water service or billing month.
- Common Water may be sourced from the Sedapal bill and the completed set of meter readings.

The Monthly Obligation is the composition layer that aligns those facts into one month-level result.

## 7. Source-Domain Boundaries

The Obligations domain composes upstream facts and must not duplicate or reimplement upstream formulas.

Source domains own their facts and calculations:

- Budget Plan owns the assessment inputs.
- Water owns readings, Sedapal bills, and water calculations.
- Gas will own gas facts and gas calculations.
- Other Charges will own approved arbitrary charges.

The Obligations domain owns the composed monthly result.

It does not own the formulas that produced the upstream facts.

## 8. Read-Service Contract

The canonical read service is:

`getMonthlyObligation({ obligationMonth })`

The active building is resolved internally through the existing TB810 server context.

Do not expose `buildingId` in the public signature.

The service returns the whole building-month result.

Each Unit result should include:

- `unitId`
- `unitNumber`
- `unitAccountId`
- `components`
- `knownTotal`
- `missingComponents`
- `readiness`
- `blockers`

The service must support a live, progressive result rather than only a finalized snapshot.

## 9. Consumer Model

The Monthly Obligation service is the shared read model for:

- the Unit page, which selects and renders one Unit’s obligation
- the future Obligations workspace, which renders the whole building month
- the future finalization workflow, which snapshots the complete or intentionally approved obligation
- future invoice generation, which reads finalized obligations only

The Unit page must not independently orchestrate assessment, water, gas, or other-charge calculations once it is tethered to this service.

## 10. Finalization and Invoice Boundary

Finalization is the point at which the progressive Monthly Obligation becomes a frozen historical record.

Invoice generation reads finalized Monthly Obligations only.

Invoices remain presentation and collection documents.

The Monthly Obligation is the financial truth.

The Invoice is the communication artifact.

The Unit Ledger remains the permanent accounting history.

## 11. Explicit Non-Goals

This document does not:

- create the Monthly Obligation service
- add persistence or migrations
- change the Unit page
- add Gas
- add Other Charges
- build the Obligations workspace
- build invoice generation
- alter existing water calculations
- alter existing budget calculations
- define the final persistence shape

## 12. Frozen Decisions

- A Monthly Obligation is the current financial truth for one Unit in one obligation month.
- Monthly Obligation is progressive and may be incomplete.
- Missing components must not be treated as zero.
- Zero and missing must remain distinguishable.
- Finalized Monthly Obligations are immutable historical snapshots.
- Invoice generation reads finalized obligations only.
- Upstream domains own facts and formulas.
- The Obligations domain composes upstream facts but does not reimplement upstream formulas.
- `getMonthlyObligation({ obligationMonth })` is the canonical public read signature.
- Building is resolved internally through the existing TB810 server context.
- The component contract includes status, amount, currency, source provenance, and blocker information.
- Initial component keys are `fixed_assessment`, `metered_water`, and `common_water`.
- Future component keys are `gas` and `other_charge`.
- The Monthly Obligation is distinct from invoice presentation and distinct from the Unit Ledger.

