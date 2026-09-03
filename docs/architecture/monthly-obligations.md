# Monthly Obligations

Status: Frozen concept document

Date: August 7, 2026

This document is the canonical architecture reference for Monthly Obligations.
It consolidates the frozen decisions that define the month-centric financial workspace for TB810.

## 1. Purpose

Monthly Obligations is the financial heart of TB810.

It is the month-centric financial operating workspace for the building.

Everything upstream contributes financial truth.
Everything downstream consumes financial truth.

Canonical philosophy:

- Facts upstream.
- Truth in the middle.
- Communication downstream.

## 2. Definitions

### Monthly Obligation

The current financial truth for one Unit Account in one obligation month.

It belongs to the Unit Account, never to the Owner.

It may be incomplete while upstream facts are still arriving.

Unit-attributable charges flow into this Monthly Obligation as the `other_charge` component.

### Finalized Monthly Obligation

The immutable historical snapshot of a Monthly Obligation after the month is finalized.

### Obligation Month

The TB810 monthly financial period to which the obligation belongs.

Obligation Month is not the same thing as Reading Month, Service Month, or Sedapal Billed Month.

### Component

A named financial contribution that participates in the Monthly Obligation total.

Every component should answer: "Why is this amount here?"

### Known Total

The sum of all currently available component amounts.

Known Total may change while the Monthly Obligation is live.

### Readiness

The completeness state of the Monthly Obligation for the month.

Readiness reflects whether the obligation is complete enough for downstream use.

### Blocker

A missing dependency or unresolved condition that prevents a component from becoming available.

## 3. Progressive Composition

Monthly Obligations progressively assemble themselves as financial truths become available.

Current providers:

- Fixed Assessment
- Metered Water
- Common Water
- Gas

Future providers:

- Other Charges
- Reserve Fund
- Others

Missing is not zero.
Missing remains explicitly missing.

Monthly Obligations always represent the latest known financial truth.
Do not describe them as previews.

## 4. Current vs Finalized

Before finalization, the Monthly Obligation is live and reflects current source facts.

After finalization, the Monthly Obligation becomes an immutable historical financial snapshot.

Corrections must not silently rewrite the finalized month.
Late or incorrect charges should be adjusted in a future Monthly Obligation, typically the following month.

Carlos does not manually create Monthly Obligations.
The system derives them automatically as underlying financial facts become available.

Carlos's approval is the accountability boundary.
The point of approval is when the current calculated Monthly Obligation becomes the approved historical snapshot for downstream use.

This approved snapshot must preserve the financial facts Carlos reviewed so later source-data changes do not silently change what was approved.

The dashboard may preview the next obligation month before that approval boundary is reached.
That preview remains live and unapproved until Carlos explicitly approves the resulting Monthly Obligation snapshot.
Month close is therefore a preparation boundary, not a freeze boundary.

## 5. Component Contract

Each component in a Monthly Obligation must include:

- stable component key
- label
- status
- amount when available
- currency
- source period or month
- source provenance
- explanation
- blocker reason when missing

Initial component keys:

- `fixed_assessment`
- `metered_water`
- `common_water`

Future component keys:

- `gas`
- `other_charge`

Component status values:

- available
- missing
- blocked
- not_applicable

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
Source month and obligation month must remain distinct, especially when the dashboard is previewing the next obligation cycle at month close.

## 7. Source-Domain Boundaries

The Obligations domain composes upstream facts and must not duplicate or reimplement upstream formulas.

Source domains own their facts and calculations:

- Budget Plan owns the assessment inputs.
- Water owns readings, Sedapal bills, and water calculations.
- Gas will own gas facts and gas calculations.
- Charges own source-charge definitions.
- Other Charges is the Unit-facing charge source that contributes to `other_charge`.

The Obligations domain owns the composed monthly result.

It does not own the formulas that produced the upstream facts.

Owner-direct charges do not contribute to Monthly Obligations and are handled in the Owner Account path instead.
The Monthly Obligation read model may therefore be progressive and incomplete while upstream source facts are still arriving.

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

Owner-direct receivables are intentionally outside this read model.

## 10. Invoice Timing

The system never decides when invoices should be generated.

There are:

- no automated readiness rules
- no required component rules
- no automatic approval workflow
- no blocking workflow
- no automatic generation

Carlos decides.
The system presents truth.

Month-close source-fact collection, such as late-entered water or gas inputs that feed the next obligation month, is a preparation boundary only.
It does not itself mean the obligation has been approved, finalized, or dispatched.

Carlos's approval is the accountability checkpoint for the obligation snapshot.
That approval does not itself mean the obligation has been dispatched.

## 11. Invoice Philosophy

Invoices are communication artifacts.

Invoices:

- snapshot the current Monthly Obligation
- never calculate
- never recalculate

Invoices can be generated:

- individually
- as a batch
- grouped for an Owner

The exact invoice/PDF/dispatch architecture remains intentionally deferred.
When that workflow is built, "ready for dispatch" must mean that Carlos has approved the obligations and the outward dispatch artifacts have been generated and are available for Guliana to send.
Approval and dispatch are separate concerns.

If a required source fact is missing, the canonical component should be representable as blocked or incomplete rather than forcing the entire building-month read to disappear.
That missing-source state must surface to consuming read models instead of being flattened into zero.

Carlos approves the financial obligation snapshot.
Guliana performs the later operational dispatch action.

Owner grouping is packaging only.
It does not change accounting identity.

## 12. Corrections

Keep corrections simple.

No invoice versioning.
No cancel/reissue workflow.
No reopening historical months.

If a charge is discovered late or entered incorrectly it should be adjusted in a future Monthly Obligation, typically the following month.

Historical invoices remain historical communication.

## 13. Role Boundary

Carlos reviews the calculated monthly obligations and deliberately approves them.
That approval is the accountability boundary for the approved financial record.

Guliana does not approve the financial obligation set.
She handles the later operational dispatch workflow once the approved artifacts are ready.

This document does not define the final invoice-generation, PDF-bundle, dispatch-tracking, or Collections implementation.
Those downstream details remain intentionally open until their dedicated workflows are designed.

## 14. Workspace Responsibilities

Monthly Obligations allows Carlos to:

- inspect monthly financial truth
- inspect Unit obligations
- inspect calculations
- inspect provenance
- inspect notes

## 14. Finalization and Invoice Boundary

Finalization is the point at which the progressive Monthly Obligation becomes a frozen historical record.

Invoice generation reads finalized Monthly Obligations only.

Invoices remain presentation and collection documents.

The Monthly Obligation is the financial truth.
The Invoice is the communication artifact.
The Unit Ledger remains the permanent accounting history.

## 15. Explicit Non-Goals

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

## 16. Frozen Decisions

- Monthly Obligations is the financial heart of TB810.
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
