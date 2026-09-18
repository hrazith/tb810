# Monthly Obligations

Status: Frozen concept document

Date: August 7, 2026

This document is the canonical architecture reference for Monthly Obligations.
It consolidates the frozen decisions that define the month-centric financial workspace for TB810.

The snapshot foundation, snapshot-aware bounded read, the first Carlos
review/approval slice, and the production-shaped pulse coordinator are
implemented. Production scheduling uses a dumb Vercel Cron heartbeat at
06:00 Lima time (11:00 UTC) on the Hobby-plan MVP; it may later become a
15-minute schedule on Vercel Pro without changing the application architecture.
Invoice generation, compressed dispatch bundles, and dispatch remain deferred.

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

Before finalization, Monthly Obligations represent the latest known financial
truth and may be described as a live, progressive preview. After finalization,
the result is a frozen obligation package and is no longer a preview.

## 4. Current vs Finalized

Before finalization, the Monthly Obligation is live and reflects current source facts.

After finalization, the Monthly Obligation becomes an immutable historical financial snapshot.

Corrections must not silently rewrite the finalized month.
Late or incorrect charges should be adjusted in a future Monthly Obligation, typically the following month.

Carlos does not manually create Monthly Obligations.
The system derives the live/progressive result as underlying financial facts
become available. There is no separate Giuliana action required to make that
calculation exist.

At the August-to-September month turn, when the September package is complete
and valid, the monthly pulse establishes `ready_for_review` and hands the live
package to Carlos without creating obligation rows or consuming Gas bills.
Carlos's approval is the atomic snapshot boundary: it persists the reviewed
rows, consumes the selected Gas bills, and marks the package approved.

Carlos's approval is the financial authority boundary. He reviews the live
package, verifies that it has not changed since review, and creates the
immutable snapshot on approval. Existing legacy snapshots are approved without
being recreated.

The provisional approval target is the fifth calendar day of the obligation
month. A `ready_for_review` snapshot is Ready for Carlos approval through day 5;
from day 6 onward, while still awaiting approval, it is Approval overdue and
dispatch is blocked. This operating policy is provisional pending Carlos's
confirmation and is not specific to September.

This approved snapshot must preserve the financial facts Carlos reviewed so later source-data changes do not silently change what was approved.

The dashboard may preview the next obligation month before that approval boundary is reached.
That preview remains live and unapproved until Carlos explicitly approves the resulting Monthly Obligation snapshot.
Snapshot creation is readiness-driven. Month close is an important guaranteed
attempt/checkpoint, but it is not the earliest allowed snapshot time: when all
required financial facts for an upcoming package become ready before month
turn, the system may snapshot that package early. The date alone does not
freeze an incomplete package; an incomplete package remains live and Not Ready
without a snapshot until its final blocker resolves.

The `ready_for_review` transition is the responsibility handoff boundary.
While a package is live, Giuliana owns its preparation. At `ready_for_review`,
Carlos owns review and approval while the package remains live and correctable;
approval creates the immutable snapshot. Giuliana immediately
begins preparing the immediate successor package. Carlos approval does not cause
a second Giuliana focus advance. Calendar month, package lifecycle, Giuliana's
operational focus, and Carlos's review state are related but independent clocks.

For example, on September 28, September may be `ready_for_review` while October
has no snapshot yet. The dashboard may simultaneously show September obligations
as Complete and Awaiting Carlos Approval and show source inputs for October
obligations. September source facts feed that October package.

If consecutive packages are handed off, Giuliana continues to the first
obligation month not yet handed off. The dashboard keeps `mostRecentHandoff`
separate from `activePackage`; Carlos's approval backlog never pins Giuliana,
and an absent Billing Period is the live candidate that terminates progression.

The dashboard may show the next obligation package as a live preview while the
current live package awaits approval. Carlos's approval creates the immutable
handed-off package's status, not the focus transfer: `ready_for_review` already
advances Giuliana's financial utility to the next live package. The calendar
alone must not advance that focus. Calendar/business date, financial readiness,
snapshot creation, and Carlos approval are coordinated lifecycle clocks rather
than one universal month clock.

The pulse coordinator is invoked automatically in production by a dumb Vercel
Cron heartbeat at 06:00 Lima time (11:00 UTC) on the Hobby-plan MVP. It may
later use `*/15 * * * *` on Vercel Pro without changing the application
architecture. The pulse selects one bounded progression candidate: the current
responsibility package or its immediate successor after handoff at
`ready_for_review`. It does not
scan historical months, invoke dashboard loaders, or couple progression to
source mutations. Human snapshot actions remain authorized by `auth.uid()` and
`has_tb810_role()`; automation uses a separate `CRON_SECRET` HTTP boundary and
server-only `SUPABASE_SECRET_KEY` execution path.

### Coordinated lifecycle clocks

For obligation month M, the relevant preceding source periods are selected by
the component rules. The lifecycle is:

```text
source facts accumulating
  -> live obligation projection
  -> required facts ready
  -> ready_for_review handoff
  -> Carlos reviews live facts
  -> canonical snapshot created on approval
  -> Carlos approves
  -> Approved · Ready for dispatch
  -> Live Preview may advance to the following obligation month
```

Calendar/business month is advanced by the business date and drives boundaries
and month-turn attempts. The canonical obligation package advances when facts
become ready and a snapshot is created. Live Preview financial focus advances
when Carlos approves the preceding package. These concepts may point at
different months by design.

For example, September source facts becoming ready on September 28 may produce
an October snapshot before October begins. If September facts remain incomplete
on October 1, October is Not Ready while October source intake proceeds toward
November. When the final September fact arrives on October 2, a later pulse may
create the October snapshot without requiring a user to manufacture it.

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

Gas supplier bills are an operationally unprocessed pool. Bills may arrive at
any time, and eligible unprocessed bills may be considered during obligation
preparation or finalization. A bill already consumed for one obligation
package must not be reused for a later package. The current `processed_at`
field provides a basic processed/unprocessed distinction, but consumed-by-
obligation attribution and atomic processing during finalization are not yet
implemented.

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

The frozen happy-path lifecycle is:

- Live Preview before the approval boundary;
- readiness-driven handoff when the package is complete and valid; month-turn guarantees an attempt;
- Awaiting Carlos Approval while the live package is under review;
- immutable snapshot creation and invoice manifestation when Carlos approves;
- Ready for Dispatch after those artifacts become available to Giuliana.

The incomplete month-turn path is also defined:

- no snapshot is created;
- the obligation remains live;
- the state is Not Ready;
- Giuliana may continue entering or correcting the missing prior-period facts;
- Carlos can see the package and its blockers but cannot approve it;
- once the final blocker is resolved and the package is complete and valid, a
  later pulse performs the delayed handoff;
- Carlos approval creates the immutable package and enters the approved state.

This delayed snapshot rejoins the happy path. The exact persistence and
transaction implementation remains deferred.

The exact UI interaction, transaction mechanics, artifact implementation, and
handling of the incomplete path remain implementation or product decisions as
specified below. Carlos remains the financial authority for approval; the
system must present the frozen package without silently recalculating it from
mutable source facts.

Persisted lifecycle state must also be projected coherently with the business
date. A future snapshot may exist because a development business date was
advanced and later rewound, but it must not be presented as post-boundary
lifecycle state before the obligation month begins. This is a presentation
rule only and does not alter the persisted Billing Period or snapshot.

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
The product behavior is nevertheless frozen: Carlos approval causes the
approved snapshot to manifest as invoices, creates the required compressed
dispatch bundles, and makes those bundles available to Giuliana. The dashboard
may represent that state as Ready for Dispatch. The exact PDF generation
library, bundle format, storage, and send mechanism remain deferred.
Approval and dispatch remain separate concerns.

## Month-Turn Exception

If required facts are missing or invalid when the month turns, the system does
not snapshot an incomplete obligation package. The obligation remains live and
is Not Ready until its blockers are resolved.

Giuliana may continue entering missing prior-period facts and correcting
erroneous prior-period facts after the boundary. The calculation remains live
while those corrections are made. There is no separate Generate, Finalize,
Snapshot, or Close action required for the delayed happy-path snapshot.

The new operational month continues independently. New physical Water or Gas
readings may be captured even when a predecessor reading is missing. The
missing predecessor can block the dependent consumption calculation, but it
does not block capture of the physical fact.

Carlos retains visibility of the incomplete package, its blockers, and the
underlying workspaces, but there is no approval action before the package has
been handed off. Once the final blocker resolves and the package is complete
and valid, a later pulse hands it off and the package enters Awaiting Carlos
Approval.

The financial obligation becomes immutable at Carlos approval. This does not make
every underlying source record globally immutable. Later source corrections
must not silently rewrite the snapshotted financial obligation; the method for
handling such corrections remains unresolved.

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

Carlos's first implementation slice is review and approval of an existing
immutable snapshot. Approval is an authority action over that package, not a
recalculation or a new snapshot operation.

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

The frozen happy-path product lifecycle is therefore:

```text
Live Preview
  -> readiness-driven handoff (month-turn guarantees an attempt)
  -> Awaiting Carlos Approval
  -> Carlos approval creates the snapshot
  -> invoices + compressed dispatch bundles available to Giuliana
  -> Ready for Dispatch
```

Rejection, reopening, post-approval corrections, amendments, and the technical
implementation of the otherwise frozen happy path remain unresolved.

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
- Snapshot eligibility is readiness-driven; month-turn guarantees an attempt but is not the earliest allowed snapshot time.
- Snapshot creation occurs atomically with Carlos approval for new packages.
- A date change alone does not resolve or freeze an incomplete package.
- Before finalization, live/progressive obligations may be presented as a preview.
- After finalization, the package is Awaiting Carlos Approval.
- Carlos approves the live reviewed package; legacy immutable snapshots are approved without being recreated.
- A future snapshot is not presentation-visible before its obligation month begins.
- `ready_for_review` advances Giuliana's primary financial focus to the immediate successor live obligation preview; later Carlos approval does not advance it again.
- Carlos approval manifests invoices and creates compressed dispatch bundles available to Giuliana.
- After approval and artifact manifestation, the package is Ready for Dispatch.
- An incomplete package at month turn is not snapshotted and remains live until its final blocker resolves.
- A delayed complete-and-valid package is handed off by a later pulse attempt and then awaits Carlos approval.
- Carlos cannot approve an incomplete, unsnapshotted package.
- Invoice generation reads finalized obligations only.
- Upstream domains own facts and formulas.
- The Obligations domain composes upstream facts but does not reimplement upstream formulas.
- `getMonthlyObligation({ obligationMonth })` is the canonical public read signature.
- Building is resolved internally through the existing TB810 server context.
- The component contract includes status, amount, currency, source provenance, and blocker information.
- Initial component keys are `fixed_assessment`, `metered_water`, and `common_water`.
- Future component keys are `gas` and `other_charge`.
- The Monthly Obligation is distinct from invoice presentation and distinct from the Unit Ledger.
