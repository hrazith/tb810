# TB810 Operational Dashboard Domain

Status: Frozen concept document

Date: September 12, 2026

This document is the canonical architecture reference for the Operational Dashboard domain in TB810.
It defines the dashboard as a staff-facing operational awareness surface and a server-side projection over canonical domain truth.

## 1. Purpose

The Operational Dashboard is TB810's interpretation of the current operational state of the building for the signed-in staff member.

Its purpose is to help the user answer:

- Where does this month stand?
- Is there anything I should care about right now?
- What is likely to require my attention next?

The dashboard should make normal operations feel calm and exceptions obvious.
It is not a module directory and not a miniature version of the underlying workspaces.

It is not:

- Water
- Gas
- Expenses
- Charges
- Owners
- Units
- a generic task list

Carlos and Guliana consume the same underlying operational truth, but the dashboard interprets and prioritizes that truth differently according to role.
Actionable work should outrank passive information.
Once an action is resolved, it should compress so that the next operational responsibility naturally rises in prominence.
A quiet dashboard is a successful state when the building is operating normally.
Do not manufacture alerts, progress indicators, or exceptions simply to make the dashboard appear active.

## 2. Primary Operating Context

Month is the primary operating context, but the dashboard intentionally represents two concurrent monthly timelines.

The first timeline is the obligation package crossing a lifecycle boundary. On September 1, this is the September 2026 package derived from August source facts. It may be Not Ready, Complete and Awaiting Carlos Approval, or a later approved or dispatched state.

The second timeline is the operational source work being collected for the next package. On September 1, Water and Gas inputs are September source inputs preparing October 2026 obligations.

These timelines must remain distinct rather than collapsing into one generic "current month" concept.

The dashboard therefore has three related responsibilities:

- the monthly status/handoff region communicates the obligation package currently crossing lifecycle boundaries;
- the Water and Gas operational area communicates source work currently being collected for the next obligation package;
- the floating Obligations utility remains the persistent financial-detail surface for the package currently deserving Giuliana's primary financial focus.

Source periods and obligation periods may differ. The dashboard should explain the relationship at a useful level, while precise service, billing, and reading-period detail remains inside the relevant domain workspace.

## 3. Domain Workspace Boundaries

The dashboard summarizes operational state.
It must not reproduce all domain detail.

Domain workspaces own the precise business rules and source-period detail:

- Water workspace owns Sedapal billing period, service month, meter-reading dates, and calculation details.
- Gas workspace owns gas billing period, source meter-reading period, supplier bill, and calculation details.
- Expenses workspace will own expense and payment preparation state.
- Obligations workspace owns detailed obligation composition and calculation.

The dashboard consumes trustworthy summaries from those domains.
It does not become another implementation of their business logic.
It must not reconstruct domain calculations or create parallel business logic.

## 4. Guliana's Mental Model

Guliana is the Building Operations Manager / operational role.

Her dashboard is primarily about situational awareness and operational intervention.

The dashboard should support thoughts such as:

- Are this month's obligations calculated and ready?
- Has Carlos reviewed them?
- What operational inputs are expected now?
- Has anything gone wrong?
- Is there anything arriving ad hoc that I need to enter?

The system should distinguish:

- normal and not yet due
- needs attention

The absence of work should not automatically become a warning.

The dashboard should not force users to reconcile implementation-level source periods, but it must make the two user-relevant timelines explicit.
Precise source-period rules remain visible inside Water and Gas workspaces where they belong.

The dashboard also distinguishes the obligation lifecycle from the operating calendar. A date provides context; successful finalization creates lifecycle state. In the normal happy path, a complete and valid package is previewed before its obligation month, automatically snapshotted at the month turn, and shown to Giuliana as Awaiting Carlos Approval.

Persisted future lifecycle state must not leak backward when the DEV business date is rewound. A snapshot is presentation-visible for its obligation month only when the business date has reached that month. Rewinding the business date changes projection only; it does not mutate, reopen, delete, or rewrite persisted lifecycle state.

Carlos approval is the financial-focus pivot. Before approval, Giuliana's floating Obligations utility stays on the current immutable package awaiting approval. After approval, that package becomes Ready for Dispatch and the utility advances to the next live obligation preview. The calendar alone must not cause that switch.

The behavior of an incomplete package remains no snapshot, a live obligation, and Not Ready. Giuliana sees actionable blockers; Carlos sees oversight/status and has no approval action until the delayed snapshot occurs.

After approval, these three concepts remain visible concurrently and must not be collapsed:

- the September package remains the current handoff as Approved and Ready for Dispatch;
- September source inputs continue as operational work feeding the October package;
- October is the live financial preview.

### Top-region communication model

The simplified top region has two high-level communication concepts. Current operational context is presented as a quiet continuation of the greeting, without a user-facing Handoff heading. For example: "September 2026 obligations are now Approved and Ready for Dispatch." A document or bundle icon may accompany this text as a semantic cue only; it must not imply that a PDF, download, or dispatch bundle exists before those capabilities are implemented.

Dashboard notices are one conditional presentation primitive with different meanings or severities:

- Needs attention identifies something Giuliana should act on;
- Worth noting provides useful situational awareness without requiring immediate action.

Routine progress remains in the Water and Gas domain cards. The floating Obligations utility remains the financial-focus surface. These responsibilities should not be duplicated by separate lifecycle, exception, and noteworthy sections.

## 5. Monthly Rhythm

The dashboard changes emphasis as the month progresses.
It should not be a static set of permanent cards.

### Month open, approximately day 1

Primary questions:

- Were the month's obligations successfully calculated?
- What is the total obligation amount?
- Are they ready for review or dispatch?
- Are there unusual obligations?
- Are there exceptions requiring investigation?

At this point, utility inputs for the new operational cycle may not exist yet.
That can be normal. Water readings at 0 of the expected units, a Sedapal bill not yet received, or zero Gas supplier bills are not warnings by themselves.

The top region reports the prior package's real state. If it is complete and snapshotted, the region communicates Complete and Awaiting Carlos Approval. If it is incomplete, it remains Not Ready with actionable blockers. The operational area separately begins the next source-work cycle.

The dashboard must not manufacture urgency simply because new-cycle inputs are not yet present.

### Early month, approximately days 4 to 6

Operational inputs begin arriving.

Possible events:

- meter snapshots arrive
- Sedapal bill arrives
- utility data becomes available
- anomalous readings may be detected

The dashboard should respond to actual state, not to arbitrary timers.

### Approximately days 7 to 10

Normal utility work should increasingly resolve.

Once normal work is complete, it should consume less dashboard attention.

Completed normal work should compress.
Exceptions should expand.

At the end of the month, the dashboard may also surface source-fact preparation for the next obligation month.
That is a month-close boundary for real upstream inputs, not a generic "day X" warning rule.

The current provisional source timing policy is:

- Water meter readings are expected through calendar day 6 and become late beginning on day 7; confidence is high based on 34 historical months, with dates observed from day 3 through day 6 and typically on day 5.
- Sedapal bills are expected through calendar day 6 and become late beginning on day 7; confidence is medium and provisional because the evidence is supplier/bill dates rather than reliable original operator-entry timestamps.
- Gas meter readings have no established lateness deadline and remain neutral/incomplete when missing.
- Gas supplier bills have no calendar lateness deadline and remain an asynchronous unprocessed pool.

Incomplete, late, and blocking are separate states. An incomplete source fact may still be within its expected operating window. A late source fact is missing after an explicit operational expectation. A blocking component is one that prevents the canonical financial package from progressing. An upcoming live preview may therefore be mathematically incomplete without creating a Giuliana operational Attention item; genuine blockers in the current obligation package remain capable of surfacing.

For a complete and valid happy-path package, month close is the automatic
snapshot boundary. The date alone does not snapshot an incomplete package.
An incomplete package remains live while Giuliana enters or corrects the
missing prior-period facts. When the final blocker resolves, the system
automatically snapshots the package and returns to Awaiting Carlos Approval.

### Business-date month boundary

The month boundary is generic and is determined from the business date and obligation month, not from a September-specific condition or a later fixed day such as September 8.

For example:

- August 31 with a September snapshot: September remains a Live Preview;
- September 1 with a September snapshot: September becomes Complete and Awaiting Carlos Approval;
- September 1 without a valid snapshot: September is Not Ready when real blockers exist;
- September source work remains preparation for October regardless of the prior package's handoff state.

Incomplete does not mean late. Calendar passage alone must not create Attention; a real business expectation or blocking rule is required.

### Mid-month

Operational emphasis may shift toward expenses and other exceptions.

The future Expenses domain may later allow the dashboard to answer questions such as:

- What expenses have accumulated?
- What has Guliana prepared for Carlos?
- What is awaiting Carlos's payment?
- Is documentation missing?
- Is anything becoming stale?

Do not implement that workflow inside this document.

## 6. Dashboard State Hierarchy

The dashboard state hierarchy is:

- monthly status and handoff
- current operational source work
- exceptions or normality
- completed work
- quick actions

This hierarchy is conceptual, not a requirement for any one card layout.

## 7. Guliana's Current Work

Water and Gas should not be represented as giant generic workflow cards.

Guliana thinks in concrete operational inputs and actions.

Water examples:

- Upload Sedapal bill
- Upload meter snapshots

Gas examples:

- Upload gas meter snapshots
- Upload supplier bill

Timing matters.

Sedapal and water meter activity normally becomes relevant during the first week of the month.
Normal and not-yet-due work must not be represented as an exception.

When the operating month closes, the dashboard may show whether the source facts that feed the next obligation month are ready, blocked, or still in progress.
That is a genuine close/posting boundary, not a manufactured overdue state.

Gas supplier bills are different: they can arrive throughout the month.
Therefore "Upload supplier bill" is an ongoing intake action and should remain available even when no supplier bill is currently expected.

## 8. Quick Actions

Quick Actions are a distinct dashboard layer.

Quick Actions are persistent entry points for events that can happen at any time.
They are verbs, not statuses.

Examples:

- Upload supplier bill
- Add charge
- Add expense

Add Expense is a future action only until the Expenses domain has been designed and built.

Quick Actions must not carry fake pending or needs-attention state merely because they exist.

Current Work is surfaced because of operating-cycle timing or state.
Quick Actions are persistent intake actions.

Read-only overdue receivable awareness may be shown as secondary situational context, but it is not a Guliana Collections workflow and does not make Collections a primary Guliana responsibility.

## 9. Completed Work

Completed normal work should compress rather than disappear entirely.

The dashboard should be able to confirm that expected monthly work happened without completed work continuing to dominate the dashboard.

Example conceptual state:

- Completed this month
- Water
- Gas
- Obligations dispatched

This is confirmation, not celebration.

## 10. Worth Noting and Exceptions

Do not conflate unusual activity with an operational exception.

Worth noting means valid, intentional activity that falls outside the normal recurring monthly pattern and may be useful to know about.

Examples:

- water fountain damage charge
- parking violation charge
- special or manual one-off charge

Exception means something about the operating process is wrong, blocked, anomalous, or unexpectedly missing.

Examples:

- obligation calculation failed
- missing ownership or domain prerequisite
- expected operational input is overdue
- blocked obligation
- meter anomaly requiring intervention

Zero exceptions is a valid and desirable state.

For MVP, prefer deterministic and explainable identification of noteworthy activity over speculative anomaly detection.

## 11. Carlos Role

Carlos is Super Admin.

His dashboard follows decision and money boundaries. It is broader financial oversight, not merely an Obligations dashboard.

His primary questions are:

- Are this month's obligations ready to go out?
- What requires my review or approval?
- How are collections progressing?
- Who has crossed into overdue?
- Is anything unusual or operationally wrong?
- Eventually: what expenses has Guliana prepared for me to pay?

Carlos reviews and approves monthly obligations, monitors overall building financial health and collections, reviews financial exceptions, and defines escalation boundaries for delinquent owners. Giuliana and her colleagues perform routine delinquency follow-up; Carlos intervenes at the authority or decision point rather than performing that routine work himself.

For Sprint 1, do not invent the Expenses workflow.
Expenses remain a future dashboard handoff area until that domain is designed.

## 12. Carlos Obligations First

Monthly obligations are the highest-priority beginning-of-month workflow for Carlos.

They need to go out like clockwork.

If the current month's obligations require Carlos's review, that actionable state should visually outrank collections and passive information.

Once Carlos has reviewed or approved the obligations, this section compresses.
Collections then naturally becomes the dominant dashboard responsibility.

The first Carlos implementation slice is intentionally narrow: review and approval of the existing immutable monthly obligation package. Carlos does not recalculate, generate, finalize, or snapshot the package.

The provisional approval target is the fifth calendar day of the obligation month. A `ready_for_review` package is shown as Ready for your approval through day 5 and as Approval overdue / Dispatch blocked from day 6 onward. This is a provisional operating policy pending Carlos's confirmation, not a September-specific rule.

The happy-path lifecycle is:

- Live Preview before successful finalization
- automatic month-turn snapshot when complete and valid
- Awaiting Carlos Approval after the immutable package is available
- Ready for Dispatch after Carlos approval manifests invoices and compressed dispatch bundles

The incomplete month-turn path is Not Ready rather than a normal lifecycle
stage. Giuliana continues resolving actionable blockers, while Carlos retains
visibility but cannot approve before snapshot. New operational intake continues
separately; it does not make the next obligation month the active package.

The dashboard must not become a miniature Obligations workspace.
The Obligations workspace is where Carlos can inspect the complete information through the already-established unit-specific and owner-responsibility lenses.

The primary approval surface should show the package status, total, and review entry point. Detailed provenance and operational Water/Gas mechanics remain secondary to the financial decision.

## 13. Worth Noting for Carlos

Worth-noting charges have a specific purpose in Carlos's obligation-review workflow.

They tell Carlos that the normal monthly machinery produced the obligations and these are the few valid items outside the ordinary recurring pattern that he may want to know about before approving the batch.

These are not automatically exceptions.

Where supported, an individual noteworthy item may deep-link into the relevant canonical obligation or unit context.

## 14. Collections Lifecycle

An obligation with an unpaid balance remains outstanding during its own monthly lifecycle.

It becomes overdue when any part remains unpaid at the start of the next month.

Outstanding means the remaining unpaid balance within the obligation's lifecycle month.
Overdue means the remaining unpaid balance carried beyond the end of that month.
Needs attention means responsibilities with overdue balances, rather than merely current-month outstanding balances.

A current-month collection percentage can be low without being treated as an operational exception.

The dashboard may surface a concise overdue list and then link to the canonical workspace for full detail.

## 15. Navigation

Primary navigation represents recurring operational work.
It does not represent the user's complete permission set.

The shell should remain fundamentally shared between Carlos and Guliana.

Primary navigation:

- Guliana: Dashboard, Obligations, Water, Gas
- Carlos: Dashboard, Obligations, Water, Gas, Other Charges

Other Charges is a Carlos-only domain for the current product model.

Primary navigation visibility must reflect actual authorization and RBAC.
Do not treat hidden UI as security.

Secondary Menu architecture:

- The Menu contains secondary product domains and account or system utilities, clearly separated by hierarchy.
- For Carlos, secondary product domains include Budget, Owners, and Units.
- The Menu is role-aware.
- Guliana should not gain access to Carlos-only secondary domains simply because they are inside the Menu.

The Menu may also contain only legitimately supported utility links such as account settings, staff or permissions where applicable, building or system settings where applicable, help, and sign out.

## 16. Read Architecture

Dashboard reads should be bounded, authoritative, server-side, projection-oriented, and based on canonical domain services or data.

Avoid:

- loading entire workspaces to derive tiny dashboard summaries
- N+1 reads
- sequential provider waterfalls
- client-side reconstruction of business rules
- duplicated calculations
- fake or demo-only state
- hardcoded month examples

The dashboard is a server-side projection over canonical domain truth.
It should not reconstruct domain calculations or create parallel business logic.

The read model may expose both September obligation facts and September
operational source intake on September 1. The latter may eventually feed
October obligations, but it does not make October the primary obligation
package merely because the calendar advanced. This does not resolve the
incomplete prior-month snapshot case.

## 17. Role-Aware Surface

Carlos and Guliana consume the same underlying operational truth, but the dashboard interprets and prioritizes that truth differently according to role.

The dashboard should be role-aware, but the shell should remain shared.

The dashboard should not become two separate applications or two unrelated navigation systems.

The first cross-role handoff sequence is:

### Sep 8A — Giuliana / Awaiting Carlos

Ordinary in-month Water and Gas intake continues for the next obligation package while the prior package remains Complete and Awaiting Carlos Approval. Partial or zero source-work progress is neutral unless an actual business rule makes it actionable. The floating utility remains on the current package.

### Sep 8B — Carlos / Review and Approve

Carlos sees the immutable September package, its status, total, and a review action. He performs a real approval action against that package. This is not a DEV state simulator.

### Sep 8C — Giuliana / Approved and Ready for Dispatch

After approval, the package is Approved and Ready for Dispatch. The next operational source-work cycle continues, and Giuliana's floating Obligations utility advances to the next live obligation preview. Invoice and compressed dispatch-bundle details belong in this region once their implementation exists.

Sep 8 is an acceptance point, not product timing logic. No production behavior should depend on a fixed date or on an arbitrary "after eight days" rule.

## 18. Sprint Scope

Sprint 1 remains intentionally narrow:

- role-aware entry
- Carlos dashboard
- Guliana dashboard
- role-specific key metrics and action launch points
- primary navigation
- secondary Menu architecture
- coherent shared shell

Do not expand this sprint into:

- Expenses implementation
- Payments or reconciliation implementation
- Reports
- new anomaly detection
- new finance calculations
- redesigning canonical Water, Gas, or Obligations workspaces
- new generic workflow framework
- new auth architecture
- new RBAC architecture

## 19. Documentation Status

The snapshot foundation, snapshot-aware bounded financial read, and the first Carlos review/approval dashboard slice are implemented. Automatic month-turn coordination, delayed automatic snapshot coordination, invoice generation, compressed dispatch-bundle generation, dispatch, and the full Carlos dashboard remain deferred implementation work.

Frozen architecture and domain decisions include:

- dashboard is operational situational awareness
- dashboard is a server-side projection over canonical domain truth
- month is the primary operating context
- the dashboard summarizes, while domain workspaces own precise source-period detail
- Guliana's dashboard mental model and month rhythm
- Quick Actions as a persistent verb layer
- Completed Work as compressed confirmation
- Worth Noting versus Exceptions
- Carlos obligations-first hierarchy
- successful finalization as the frozen-package boundary
- Awaiting Carlos Approval and Ready for Dispatch as post-finalization states
- automatic happy-path month-turn snapshot for complete, valid packages
- no snapshot for incomplete or invalid packages at month turn
- automatic delayed snapshot after the final blocker resolves
- approval-triggered invoice and compressed-bundle manifestation
- operational source intake kept distinct from the next obligation package
- collections lifecycle semantics
- primary navigation versus secondary Menu architecture
- role-aware dashboard and shared shell
- two concurrent monthly timelines and the monthly status/handoff region
- business-date-coherent lifecycle presentation
- Carlos approval as Giuliana's financial-focus pivot
- provisional approval target by the fifth calendar day of the obligation month
- the narrow Sep 8A to Sep 8B to Sep 8C cross-role acceptance sequence
- the simplified greeting, handoff, and shared notice presentation model
- provisional Water and Sedapal source-lateness boundaries
- source-work lateness kept separate from upcoming financial-preview blockers
- the narrow DEV Carlos approval reset acceptance control

Implementation or visual details still open include:

- exact typography
- card dimensions
- spacing
- precise responsive behavior
- exact microcopy where not explicitly frozen
- final iconography
- whether some completed states collapse further
- exact deterministic noteworthy query implementation
- exact deep-link behavior
- exact dashboard server-read shape

These are implementation details, not domain-open questions.

### DEV acceptance controls

The development-only panel has Time, Data, and Style tabs. Time changes the canonical DEV business date; it is not database time travel and does not rewind persisted mutations. Data controls establish narrow deterministic source/domain facts such as Water readings, Sedapal bills, Gas readings, Gas supplier bills, and Unit Charges. Production reads and projection derive the resulting dashboard state; the panel must not manufacture Attention, Worth noting, lifecycle labels, or fake financial state.

The DEV panel also has one narrow Carlos approval replay control. When the current business-month Billing Period is approved, it may be reset to `ready_for_review` while clearing `approved_at` and `approved_by`. It does not delete or regenerate the immutable snapshot, monthly obligation rows, or source facts. This is not a generic lifecycle editor or scenario framework. Because the existing DEV journal records domain source-record mutations rather than Billing Period lifecycle metadata, Reset session must not be assumed to restore Carlos approval state.

The current DEV panel is an acceptance-testing aid, not a production workflow. The reset control is guarded by development mode, an active DEV test session, and the approved status of the current Billing Period.

### Read and invalidation invariants

The dashboard remains a server-side projection over the bounded canonical building-month financial-facts read. A cold dashboard request uses exactly one bounded financial-facts RPC; warm repeated reads add zero underlying financial-facts RPCs. Source-work attention derivation adds no reads, RPCs, client fetching, or N+1 behavior. DEV mutations revalidate the necessary root/layout surfaces and invalidate the relevant bounded facts cache. The module-local cache's invalidation behavior across separately instantiated Next.js runtime/module contexts remains known architectural debt; this document does not claim it is a universal cross-runtime cache mechanism.

## 20. Relationship to Other Canonical Documents

This document sits above the detailed domain references for:

- Water
- Gas
- Budget Plans
- Monthly Obligations
- Expenses

Those documents own the precise domain behavior.
This document only defines how the dashboard should summarize current operational state across them.
