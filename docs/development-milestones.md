# Development Milestones

## Road to October — First Real Ride

**Date context:** September 24, 2026  
**Target:** Turn of month into October 2026

> **Prove TB810 can carry Giuliana and Carlos through one real turn of the monthly financial cycle using actual building data, with numbers Carlos can trust.**

This is not a goal to finish TB810. It is a focused operational milestone.

The intended demonstration is:

1. Giuliana enters the actual September source facts.
2. TB810 clearly shows what is complete and what still blocks October.
3. October becomes financially ready naturally as source work is completed.
4. At the correct turn-of-month rhythm, Pulse makes October eligible for handoff.
5. Giuliana hands October to Carlos.
6. Carlos sees an October package produced from the real source facts.
7. TB810's October obligations match the legacy calculation exactly.
8. Carlos reviews and approves the package.

The demo should feel like the first credible operational month in TB810, not a feature walkthrough.

### A — Historical lifecycle boundary — CLOSED

September 2026 is the beginning of TB810's native Obligation history. Months before September 2026 remain historical source-data periods. TB810 does not need to reconstruct or approve retroactive obligation packages for earlier periods. Historical lifecycle repair is not part of the October checkpoint.

### B — Water baseline + operational intake

#### B1 — Sedapal / Common Water — COMPLETE

B1.1 Historical reconciliation, B1.2 monthly bill entry, B1.3 PDF attachment and retrieval, B1.4 DEV-safe testing, B1.5 live/native bill intake, and B1.6 Sedapal UX are complete.

Frozen UX/product decisions:

- Monthly Reading is a floating workspace action.
- Add Monthly Reading is a focused two-step modal.
- Step 1 selects the Sedapal PDF locally.
- Step 2 captures Reading date, Invoice amount, and Current reading.
- Previous reading is contextual information, not an editable Add-mode field.
- Final Save is the only persistence point.
- Historical imported bills remain read-only.
- Native bills may be edited according to the target obligation-month lifecycle.
- The ledger exposes PDF and Edit directly; no separate detail workflow is required for MVP.

Sedapal service-month semantics remain:

```text
service month -> following-month reading/source Billing Period -> following obligation month
```

Example: August service -> September source input -> October obligation.

#### B2 — Unit Water — CLOSED / ACCEPTED

- **B2.1 Full historical integrity audit — COMPLETE**
- **B2.2 Discover newest authoritative legacy data — COMPLETE**
- **B2.3 Reconcile proven discrepancies — COMPLETE**

Authoritative Unit Water history exists from September 2023 through August 2026. Every legacy month contains 64 residential Unit Water readings.

Development cleanup policy: old test data does not require production-grade historical preservation. If it conflicts with authoritative history or blocks the October workflow, remove it surgically. Protect authoritative historical and operational data; do not broad-delete or reimport already-correct history.

Current reconciliation target:

- preserve correct historical rows
- replace contaminated July 2026 slots for units 201, 202, 203, 204, and 404
- replace the contaminated August Unit 201 reading
- insert the remaining missing authoritative August readings
- clean/reset the development-era September obligation package if it blocks reconciliation

Expected historical end state: September 2023 through August 2026, 36 months, 64 readings per month, 2,304 authoritative Unit Water readings.

#### B2.4 Establish operational boundary — COMPLETE

After reconciliation, freeze the boundary:

- Legacy Unit Water: through August 2026
- Native TB810 Unit Water: September 2026 onward

September 2026 is the first native operational Unit Water input month.

#### B2.5 Unit Water intake UX — CLOSED / ACCEPTED

The accepted Unit Water workflow provides a projected expected-unit ledger, canonical Previous readings, direct Current and Reading Date entry, a downloadable semantic XLSX template, preview and validation before persistence, workbook-provided dates, atomic confirmed import, current-month editing and deletion, and a production-safe Start over operation. Historical/locked readings remain protected.

For the accepted September 25 walkthrough:

- business date and operating month: September 2026;
- Giuliana working obligation month: October 2026;
- Water source month: September 2026;
- lifecycle/progression month remains independently selected by lifecycle state;
- 64/64 readings, with aggregate Unit Water consumption of 509;
- Sedapal: 12,146 -> 12,846, building consumption 700, invoice PEN 3,100.00;
- October Water summary: Metered Water PEN 2,254.14 and displayed aggregate Common Water PEN 846.08;
- the negative Common Water warning is absent and Water no longer blocks October readiness;
- Gas remains the next blocking source domain.

Start over is limited to the current editable Unit Water month. It atomically removes that month's readings while preserving historical Water, the roster, Sedapal, Gas, Charges, lifecycle state, obligations, and unrelated DEV mutations. When DEV is active, matching Water ownership journal rows are reconciled in the same transaction.

Water is now **CLOSED / ACCEPTED** for the Road to October checkpoint. Remaining Water UX debt is non-blocking and deferred to one consolidated pass: replace the native Start over confirmation with a TB810 confirmation dialog; reconsider Start over and Upload readings as one contextual intake/recovery control; reduce the visual dominance of repeated red per-row Delete actions; retain visible month/obligation context in Sedapal intake; rename Sedapal "Save Reading" to bill-operation language; and make the post-review workbook confirmation action the clear focus.

### C — Gas operational readiness

Do not turn this into a historical Gas reconstruction project unless history directly blocks the October cycle.

- **C1:** Confirm the actual currently applicable September Gas-served units using current operational applicability.
- **C2:** Ensure Giuliana can efficiently enter and verify the actual September Gas readings.
- **C3:** Verify the real Gas supplier-bill workflow and UX. Bill presence is not automatically Gas readiness unless the current business rule requires it.
- **C4:** Confirm DEV-safe current-month testing and reset without damaging authoritative history.

### D — September -> October REAL cycle — CARLOS CHECKPOINT

#### D1 — Clean starting state

Before the real ride, authoritative history through August must be clean enough to support the cycle, stale development/test obligation packages must not contaminate September or October, and September must be available as the real operational source month.

#### D2 — Giuliana enters actual September facts

Use real building inputs, not fixtures or demo values:

- actual Sedapal/Common Water bill
- all 64 actual Unit Water readings
- actual applicable Gas readings
- actual Gas supplier-bill facts where relevant
- actual Unit/Owner charges relevant to October

The intake workflows must be usable enough for Giuliana to perform this herself.

#### D3 — October unblocks naturally

Do not manually manufacture Ready state. As required source work is completed, TB810 should progress naturally from Missing / Building / Blocked to Ready and make the remaining blockers obvious.

#### D4 — Legacy parity validation

Before the Carlos demo, independently reproduce the legacy October calculation from the exact same real September facts. Compare TB810 October with Legacy October at component, unit, owner where applicable, and grand-total levels. Relevant components include Water, Gas, regular/common obligations, Unit Charges, and Owner-direct charges. Do not accept unexplained differences; matching only the grand total is insufficient.

#### D5 — Monthly beat / Pulse

Financial readiness and handoff eligibility remain separate. October may become financially ready before month-turn; at the appropriate calendar boundary, Pulse makes October eligible for handoff. Giuliana then hands October to Carlos, while operational attention advances into November. Do not bypass Pulse merely to make the demo work.

#### D6 — Carlos review + approval

Carlos should receive a quiet, credible October package showing approval readiness, source-work completion, package total, relevant component/unit/owner detail, and genuine financial exceptions. He should recognize that TB810 matches the trusted legacy calculation, then approve the package.

## Demo Story

> “Rather than walking through features, we are showing one month in the life of the building and how TB810 coordinates Giuliana’s work with Carlos’s.”

The product should tell this story directly:

- Giuliana enters real source facts, sees October become complete, reaches the monthly boundary, and hands off through Pulse.
- Carlos receives the completed October package, recognizes the numbers, reviews, and approves.

Avoid turning the demo into a tour of screens.

## 4–5 Day Critical Path

### B2.5 Slice A Status

Slice A implements the primary Unit Water monthly intake contract:

- the active-month workspace can generate the canonical `DEP-{unit_number}` / `Lectura` workbook;
- upload parses and validates without writing readings;
- a complete valid batch is reviewed with derived Previous and Consumption values;
- one confirmed batch Reading Date is required and must belong to the selected month;
- confirmation uses the canonical `tb810_meter_readings` month identity and one atomic persistence operation;
- active DEV sessions use the transactional Unit Water import journal wrapper for exact reset ownership.

Manual acceptance remains outstanding, so B2.5 is not complete.

1. Complete B2.3 Unit Water historical/development cleanup.
2. Freeze the B2.4 operational boundary.
3. Inspect and tighten B2.5 Unit Water intake UX.
4. Validate the C Gas intake workflow using real September needs.
5. Enter or rehearse actual September source facts.
6. Validate the October obligation calculation against legacy.
7. Fix only discrepancies or blockers that prevent parity or the operational ride.
8. Validate Pulse/handoff at the month boundary.
9. Validate the Carlos review/approval experience.
10. Rehearse the complete Giuliana -> Carlos story.

This order may change if a direct blocker to D is discovered.

## Explicitly Deferred Unless They Block D

Do not allow these to consume the next 4–5 days unless they directly block the October checkpoint:

- perfect historical Gas reconstruction
- generalized historical repair tooling
- broad historical obligation reconstruction
- historical importer refactor
- generalized force-reset infrastructure
- deep approved-snapshot archaeology
- generalized snapshot redesign
- invoice generation
- expense-domain expansion
- collection/delinquency workflow expansion
- unrelated architectural cleanup
- broad refactors
- speculative abstractions

Known importer technical debt: historical Water importer matching uses `unit_id + exact reading_date`, while database uniqueness uses `building_id + unit_id + utility_type_id + reading_month`. This does not outrank the October checkpoint unless it blocks the real cycle.

## Checkpoint Success Criteria

- [ ] Authoritative Water history through August is clean enough for the operational cycle.
- [ ] September is a clean native source-input month.
- [ ] Giuliana can enter the real September Sedapal facts.
- [ ] Giuliana can enter all 64 real September Unit Water readings.
- [ ] Giuliana can enter the required real September Gas facts.
- [ ] Relevant September charges can be represented correctly.
- [ ] TB810 clearly communicates missing and completed source work.
- [ ] October becomes financially ready from those facts without manually forcing status.
- [ ] TB810 October obligations match the legacy October calculation at unit/component level and in total.
- [ ] Pulse behaves correctly at the monthly boundary.
- [ ] Giuliana can hand October to Carlos.
- [ ] Carlos receives the correct October package.
- [ ] Carlos can inspect the package without confusing live and recomputed information.
- [ ] Carlos can approve October.
- [ ] The complete Giuliana -> Carlos workflow can be demonstrated coherently as one monthly operational story.

## Working Principle

> “Build what makes the October ride credible. Fix what blocks the ride. Defer what does neither.”

> “Authoritative operational and historical data should be protected. Development/test artifacts may be surgically removed when they interfere with establishing the correct operational state.”
