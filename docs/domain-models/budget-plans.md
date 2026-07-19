# Budget Plans Domain

The authoritative finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This document remains the domain-model companion for Budget Plans.

## Purpose

A Budget Plan is the year-scoped configuration record that establishes the Monthly Assessment Pool for TB810.

It is intentionally a very small aggregate.

## Current Implementation

TB810 now persists a single Budget Plan entry point for the active building and calendar year.

For the first implemented slice, the Budget Plan stores:

- plan year
- currency
- monthly operating budget

This is the entry point for the Finance Foundation v1 UI, not the monthly obligation calculation itself.

## Confirmed Business Rules

- One Budget Plan per calendar year.
- The Budget Plan stores exactly one business decision:
  - Year
  - Monthly Assessment Pool
- The Monthly Assessment Pool represents the total fixed maintenance amount to be collected every month across all Units.
- It is not a yearly monetary total.
- There is no divide-by-12 calculation anywhere in the model.

## Derived Financial Rule

The Fixed Monthly Assessment is always derived.
It is a derived planning value, recalculated from the current Budget Plan and Unit Participation Percentage.
It is not a historical financial record.
Historical monthly charges are represented by Monthly Financial Obligations, which snapshot the Fixed Monthly Assessment at the time obligations are generated.

Formula:

`Monthly Assessment Pool × Unit Participation Percentage = Fixed Monthly Assessment`

Budget Plans never persist calculated assessments.

The calculation is deterministic and should always be derived.

## Invoice Behavior

- Budget Plan is configuration.
- Fixed Monthly Assessment is derived calculation.
- Invoice is historical financial record.
- Invoices persist the calculated amounts that were billed.
- Budget Plans do not.

## Budget Preview

Creating or editing a Budget Plan should eventually lead to a Budget Preview.

The preview calculates the Fixed Monthly Assessment for every Unit.

The preview does not create invoices.

The preview exists to help Carlos validate the Monthly Assessment Pool before continuing.

The exact contents of the preview remain intentionally open until discussed with Carlos.

## Budget Lifecycle

Current evidence does not support introducing lifecycle states.

There is currently no evidence for:

- Draft
- Approved
- Active
- Superseded
- Archived

Carlos appears to enter the agreed Monthly Assessment Pool after the budget meeting.

The system currently behaves more like:

Budget Meeting
→ Carlos enters Monthly Assessment Pool
→ Done

Document lifecycle states as intentionally omitted until the business demonstrates a need.

## Editing

Carlos can edit the Monthly Assessment Pool.

If invoicing has already begun, the legacy system appears to rely on Unit Adjustments rather than budget versioning.

Document this observation but do not introduce a solution.

## Participation Percentages

- Participation Percentage belongs to the Unit.
- The Budget Plan never owns or stores Participation Percentages.
- The Unit inventory is considered fixed.
- Carlos confirmed there will be no future additions of:
  - Apartments
  - Parking Spaces
  - Storage Units
- No workflows need to exist for redistributing Participation Percentages due to future Unit additions.

## Frozen Decisions

- One Budget Plan per year.
- Monthly Assessment Pool is stored.
- Fixed Monthly Assessments are always derived.
- Budget Plans do not store calculated assessments.
- Budget Preview derives assessments.
- Invoices store historical billed amounts.
- Participation Percentages belong to Units.
- Unit inventory is fixed.
- Budget lifecycle intentionally omitted.
- Budget Plan intentionally remains a small aggregate.

## Next Step

The next finance step is to use the persisted Monthly Operating Budget to generate Monthly Financial Obligations later in the finance flow.

See also:

- [`docs/research/questions-for-carlos.md`](/Users/roon/dev/tb810/docs/research/questions-for-carlos.md)
