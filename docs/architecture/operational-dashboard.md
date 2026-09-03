# TB810 Operational Dashboard Domain

Status: Frozen concept document

Date: August 27, 2026

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

Month is the primary operating context.

The dashboard is anchored to the current operating month.

Users should not have to mentally reconcile multiple source periods on the dashboard.

Some calculations may consume facts from another service period.
That precision belongs inside the relevant domain workspace, not on the dashboard.

At month close, Guliana's dashboard intentionally spans two related temporal contexts:

- the current operating/source month
- the upcoming obligation month

The dashboard may answer both:

- whether the source work feeding the upcoming obligation cycle is complete or blocked
- what obligation set those source facts are progressively producing for Carlos to review

The dashboard should communicate:

- "What is the state of August?"

rather than:

- "Prepare July gas while preparing August water."

Avoid competing month labels on the dashboard.
The dashboard should speak primarily in terms of the current operating month.
Do not collapse source month and obligation month into one "current month" concept when the dashboard is intentionally previewing the next obligation cycle.

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

The dashboard should speak primarily in terms of the current operating month.
Precise source periods remain visible inside Water and Gas workspaces where they belong.

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

At this point, utility inputs may not exist yet.
That can be normal.

The dashboard should not manufacture urgency simply because those inputs are not yet present.

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

- month state
- current work
- exceptions or normality
- completed
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

His dashboard follows decision and money boundaries.

His primary questions are:

- Are this month's obligations ready to go out?
- What requires my review or approval?
- How are collections progressing?
- Who has crossed into overdue?
- Is anything unusual or operationally wrong?
- Eventually: what expenses has Guliana prepared for me to pay?

For Sprint 1, do not invent the Expenses workflow.
Expenses remain a future dashboard handoff area until that domain is designed.

## 12. Carlos Obligations First

Monthly obligations are the highest-priority beginning-of-month workflow for Carlos.

They need to go out like clockwork.

If the current month's obligations require Carlos's review, that actionable state should visually outrank collections and passive information.

Once Carlos has reviewed or approved the obligations, this section compresses.
Collections then naturally becomes the dominant dashboard responsibility.

The dashboard must not become a miniature Obligations workspace.
The Obligations workspace is where Carlos can inspect the complete information through the already-established unit-specific and owner-responsibility lenses.

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

## 17. Role-Aware Surface

Carlos and Guliana consume the same underlying operational truth, but the dashboard interprets and prioritizes that truth differently according to role.

The dashboard should be role-aware, but the shell should remain shared.

The dashboard should not become two separate applications or two unrelated navigation systems.

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
- collections lifecycle semantics
- primary navigation versus secondary Menu architecture
- role-aware dashboard and shared shell

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

## 20. Relationship to Other Canonical Documents

This document sits above the detailed domain references for:

- Water
- Gas
- Budget Plans
- Monthly Obligations
- Expenses

Those documents own the precise domain behavior.
This document only defines how the dashboard should summarize current operational state across them.

## 6. Dashboard Read Model

The dashboard should be implemented as a dashboard read model that composes existing canonical domain reads.

It should not let a React page independently query Water, Gas, Charges, Budget, and other domains as unrelated one-off fetches.

Preferred shape:

- dashboard
  - staff context
  - dashboard read model
  - canonical domain reads
  - database

The dashboard should consume domain state, not recalculate domain truth.

Avoid N+1 behavior.
Avoid fetching detailed datasets when the dashboard only needs a small status summary.

Do not create a new database RPC unless the existing architecture genuinely requires it.

## 7. Current Dashboard Content

The dashboard should focus on:

- personal and time context
- the current month's operating work
- a lightweight area for useful non-scheduled actions
- exceptions only when they are meaningful and cheap to derive truthfully

The dashboard should not be dominated by:

- owner administration
- unit administration
- ownership transfer
- budget CRUD
- financial collection metrics
- system administration

Those belong primarily to Carlos or other administrative contexts.

## 8. Role Behavior

The dashboard uses the canonical staff context.

The role is the product boundary.

The dashboard should render for building_manager.

Do not infer dashboard behavior from email address or user id.

Carlos, as super_admin, should not accidentally receive the Guliana dashboard as his final experience.

## 9. Canonical Presentation Principles

Use plain operational language.

Prefer:

- August operations
- Prepare July gas
- Enter Sedapal bill
- Review water readings
- Done
- Needs attention

Avoid software-centric language such as:

- Manage Water Module
- Gas Administration
- Utility Management

The dashboard should describe Guliana's work, not TB810's database taxonomy.

Keep the page visually restrained.

The goal is strong hierarchy, calm typography, generous spacing, clear task state, and obvious action.

## 10. Security

UI visibility is not authorization.

Database and RLS remain the authoritative security boundary.

The dashboard must not introduce a service-role client into normal request handling.

It must not weaken RLS.

## 11. Relationship to Other Canonical Documents

This document sits above the detailed domain references for:

- Water
- Gas
- Budget Plans
- Monthly Obligations
- Expenses

Those documents own the precise domain behavior.
This document only defines how the dashboard should summarize current operational state across them.
