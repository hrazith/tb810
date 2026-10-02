# Development Milestones

## Road to October — First Real Ride

**Date context:** September 2026
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
7. TB810's October obligations can be proven against the existing operating model.
8. Carlos reviews and approves the package.
9. TB810 creates the immutable October obligation snapshot and processes the exact consumed Gas supplier bills.

The demo should feel like the first credible operational month in TB810, not a feature walkthrough.

### The First Ride — September -> October 2026

The durable historical cutover ledger is [`docs/migrations/october-2026-first-ride.md`](migrations/october-2026-first-ride.md). It separates legacy facts, reconciled facts, Carlos-confirmed business facts, TB810 decisions, and open migration questions.

The First Ride asks whether Giuliana can complete the real September operation in TB810, whether TB810 can produce an October obligation whose numbers can be proven against the existing operating model, and whether that package can make the real handoff to Carlos for approval.

The First Ride ends when:

- real September source facts have been entered;
- October calculations are proven;
- October reaches the correct handoff;
- Carlos can understand and review the package;
- Carlos approves;
- the immutable October obligation snapshot is created; and
- the consumed Gas supplier bills become processed.

Invoice generation and dispatch are not required to complete the First Ride.

### The Ruthless Scope

For any proposed work, ask:

1. Does this help Giuliana complete the real September work?
2. Does this help prove October's numbers?
3. Does this help complete the handoff to Carlos?

If the answer is no to all three, it does not enter the First Ride unless explicitly reconsidered.

Long term, TB810 should replace the operational Gas workbook completely. That does not mean every workbook capability belongs in the First Ride. Deferred capabilities remain documented as known omissions, not forgotten requirements.

### A — Historical lifecycle boundary — CLOSED

The authoritative legacy snapshot is [`legacy/sql/torrebal_admincondo.sql`](../legacy/sql/torrebal_admincondo.sql), replaced with a fresh production export on September 28, 2026. The older `legacy/sql/localhost.sql` is not authoritative and must not be used for cutover or parity decisions.

The cutover boundary is frozen:

- August 2026: final authoritative legacy Unit Water and Sedapal source cycle;
- September 2026: final legacy-generated obligation month and native TB810 source-input month;
- October 2026: intended first native TB810 obligation month and First Real Ride.

The month model is:

```text
August legacy source facts -> September legacy obligation
September native TB810 source facts -> October native obligation
```

September source work must not be conflated with September obligation generation. September does not need to be retroactively pushed through the native Giuliana -> Pulse -> Carlos -> snapshot workflow merely to make lifecycle state appear complete. Months before October remain historical/cutover data for this milestone; October is the native lifecycle proof.

### Historical Data Integrity Gates — OWNERSHIP OPEN

The Jan-August historical mirror principle is frozen: TB810 historical facts must match the authoritative Legacy export unless an intentional transformation or policy difference is explicitly documented.

The historical mirror principle includes documented gaps in the authoritative Legacy source. TB810 must not manufacture values merely to make historical datasets structurally complete.

Current status:

- [x] July 2026 Unit Water contamination: restored from the authoritative Legacy readings; the contaminated TB810 aggregate was 429.997 versus the Legacy aggregate of 709. Post-repair July is 64/64 and aggregate 709.
- [x] Historical Gas import integrity: 452 populated Jan-Aug readings in Legacy and TB810 match after the established three-decimal normalization; duplicate unit-month groups are zero and no synthetic historical Gas readings were created.
- [x] The 12 missing Gas cells are confirmed blank in the authoritative Legacy workbook and are documented as a Legacy source gap, not a TB810 integrity defect.
- [ ] Ownership provenance: resolve or document the remaining effective-ownership provenance cases.

The Legacy Gas source gap remains documented and open for future evidence, but it is not a blocker to First Ride. The remaining historical gate is ownership provenance. The detailed evidence is in [`2026-business-fact-provenance-audit.md`](migrations/2026-business-fact-provenance-audit.md).

### B — Water baseline + operational intake — CLOSED

#### Financial and cutover decisions — FROZEN / OPEN WHERE NOTED

The authoritative legacy September inventory is 77 maintenance bills for 76 distinct owners:

- persisted parent total: PEN 24,687.11;
- fixed parent total: PEN 21,464.15;
- Water parent total: PEN 3,042.96;
- Others parent total: PEN 180.00.

Known cent-level parent/detail differences are part of the legacy record and must not be normalized solely for parity.

The authoritative 2026 monthly operating budget is PEN 20,055.00. TB810's earlier PEN 22,000.00 value was a development entry made through the Budget UI, not a newer business value, and has been corrected through that same UI to PEN 20,055.00. No historical budget versioning is required to explain the former development value.

Legacy `units.bill_adjustment` is a generic legacy mechanism, not a canonical TB810 concept. Its observed behavior is:

```text
round(monthly budget * participation percentage, 2) + bill_adjustment
```

The September 28 legacy configuration contains 63 condos at PEN 22.00, Unit 904 at PEN 10.00, EST-13 at PEN 8.40, and EST-42 at PEN 8.00. All 66 adjusted units match their September legacy detail rows. The May 2026 PEN 22 pattern is bulk-like but its mechanism and business purpose are not proven; it must be translated by meaning rather than automatically migrated.

Whether the PEN 22 condo charge continues into October is **BUSINESS CONFIRMATION REQUIRED**. Do not silently carry it forward or silently remove it.

TB810 charge semantics are frozen:

- a Unit Charge belongs to a Unit/property and follows the applicable owner for the obligation period;
- an Owner Direct Charge belongs directly to an Owner and is not dependent on a Unit;
- both require a mandatory explanatory comment, including bulk-created charges;
- bulk operations must remain identifiable as grouped operations and support coherent review/edit/removal before approval.

Carlos confirmed that the May PEN 22 pattern represents `Bono empleados`. For October-December 2026, the intended native representation is a separate grouped PEN 22 Unit Charge for every condo, including Unit 904. Unit 904's historical PEN 10, EST-13's PEN 8.40, and EST-42's PEN 8.00 remain open and must not be carried into October automatically.

The September 2026 legacy financial parity checkpoint is **PROVEN / CLOSED**. All 77 obligations are mathematically explained, with exact detail-level parity and a documented legacy-versus-native Water policy difference. The detailed ledger is [`docs/migrations/september-2026-legacy-parity.md`](migrations/september-2026-legacy-parity.md). Do not materialize native September obligations merely to make lifecycle state appear complete.

Legacy September Metered Water is PEN 2,936.08 because the historical system applied its stored rounded PEN 4.28 unit price per condo. Current TB810's precise-rate result is PEN 2,935.07, a proven PEN 1.01 policy difference. The October Water policy choice remains open and must be explicit before native October approval; no calculation change is implied here.

#### B1 — Sedapal / Common Water — COMPLETE

B1.1 Historical reconciliation, B1.2 monthly bill entry, B1.3 PDF attachment and retrieval, B1.4 DEV-safe testing, B1.5 live/native bill intake, and B1.6 Sedapal UX are complete.

Frozen UX/product decisions:

- Monthly Reading is a floating workspace action.
- Add Monthly Reading is a focused two-step modal.
- Step 1 selects the Sedapal PDF locally.
- Step 2 captures Reading date, Invoice amount, and Current reading.
- Previous reading is contextual information, not an editable Add-mode field.
- Final Save is the only persistence point.
- Sedapal bills remain editable until the obligation package that consumes them is approved, regardless of legacy/native provenance.
- After Carlos approval, the consuming package finalizes the source facts and the bill becomes read-only.
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

Completed historical reconciliation:

- preserve correct historical rows
- replace the 59 contaminated July 2026 trial rows with authoritative Legacy rows
- preserve the five already-correct July Legacy rows
- preserve the existing August and September operational sets

Expected historical end state: September 2023 through August 2026, 36 months, 64 readings per month, 2,304 authoritative Unit Water readings.

July 2026 was restored on September 30, 2026 from `legacy/sql/torrebal_admincondo.sql` in one guarded transaction. No active DEV session owned the contaminated rows; the five existing Legacy rows were preserved, and the 59 trial rows were replaced with Legacy-backed rows.

#### B2.4 Establish operational boundary — COMPLETE

After reconciliation, freeze the boundary:

- Legacy Unit Water: through August 2026
- Native TB810 Unit Water: September 2026 onward

September 2026 is the first native operational Unit Water input month; October 2026 is the first native TB810 obligation lifecycle month.

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

### Gas business model

The frozen Gas model is:

```text
supplier purchases arrive
-> supplier bills accumulate in an unprocessed pool
-> Gas meter readings establish unit consumption
-> accumulated supplier cost / aggregate consumption = blended Gas rate
-> rate x unit consumption = unit Gas allocation
-> allocations become part of the monthly obligation
-> handoff to Carlos
-> approval creates immutable snapshot
-> exact consumed supplier bills become processed
```

Frozen semantics:

- Draft Supplier Bills are the live unprocessed pool.
- Multiple supplier bills may accumulate into one obligation.
- Bills may cross invoice-date/calendar boundaries.
- Invoice date is source metadata and an eligibility/cutoff fact, not the primary historical grouping model.
- No supplier-bill service month is introduced for the First Ride.
- Native processed bills are grouped by the obligation package that consumed them.
- Native snapshot `sourceIds` are canonical provenance.
- Native obligation bundles are not fabricated for legacy/pre-snapshot processed bills.

### C — September Gas Meter Readings — CLOSED / ACCEPTED / FROZEN

The Gas reading roster, current-month intake, complete-set import, date validation, current-month editability, historical protection, and safe current-month reset are accepted for the First Ride.

### D — Gas Supplier Bills + Gas business parity — CURRENT

The remaining First Ride work is:

- Draft pool UX pass;
- Processed obligation-bundle UX pass;
- real September supplier-bill intake;
- CRUD acceptance;
- duplicate and error handling;
- authorization and building-isolation hardening;
- processed immutability;
- calculation integration;
- exact source provenance and Carlos's read-only constituent-bill view; and
- thorough functional and UX testing.

#### Gas capabilities inside the First Ride

- September Gas Meter Readings;
- Gas Supplier Bill intake and the live draft pool;
- multiple-bill accumulation;
- supplier bill edit/delete behavior before processing;
- safe authorization and building isolation;
- Gas calculation, supplier-pool total, aggregate consumption, blended rate, and per-unit allocation;
- exact source provenance;
- October readiness;
- Pulse/month-turn handoff;
- Carlos review and proof;
- Carlos approval;
- immutable snapshot creation; and
- processing of the consumed supplier bills.

#### Gas capabilities deliberately deferred

These are known workbook capabilities, but are not required for the First Ride:

- supplier PDF/image storage and OCR;
- Gas-cylinder inventory management;
- explicit supplier service-period field;
- invoice generation and dispatch;
- owner Gas statements;
- payment allocation;
- Gas debt and aging;
- bank deposit workflow;
- collection workflow;
- advanced reconciliation/reporting; and
- historical bundle reconstruction without authoritative provenance.

### E — Remaining September source inputs / Charges — PENDING

Complete the real September source facts and any Unit/Owner charges relevant to October.

### F — October calculation parity and proof — PENDING

Prove the October calculation against the workbook business model at component, unit, owner where applicable, and grand-total levels. Do not accept an unexplained difference merely because the grand total matches.

### G — Month-turn / Pulse handoff — CLOSED / ACCEPTED

Financial readiness and calendar handoff eligibility remain separate. The
controlled November proof established that a Ready package is a Pulse no-op
before its obligation month, then hands off on the first eligible business date
without bypassing the lifecycle. October 31, 2026 was ineligible for November;
November 1 returned `handed_off` and advanced the DEV journal from 191 to 192.

### H — Carlos review and approval — PENDING

Carlos must see a credible October package, understand the live financial composition and exact constituent Gas bills through a read-only view, and approve only through the server-authorized approval path.

### I — October immutable snapshot / First Ride complete — PENDING

Approval must create the immutable October obligation snapshot and process the exact consumed native Gas supplier bills. Invoice generation and dispatch remain outside this milestone.

### J — Invoice generation / dispatch — POST-FIRST-RIDE / DEFERRED

Invoice generation and dispatch are not required for the First Ride.

### Frozen Gas First Ride decisions

- **Zero supplier bills:** No eligible supplier bills means PEN 0 supplier spend. With complete valid readings and nonzero consumption, the result is a PEN 0 blended rate and PEN 0 Gas allocations. No separate zero-spend confirmation is required for the First Ride.
- **Calculation and rounding:** The blended rate uses full available precision internally. Each unit multiplies consumption by the unrounded rate, then rounds its final Gas obligation to two decimals. Residual cents are not redistributed merely to force the rounded aggregate to equal the supplier pool. Historical parity covered six representative periods and 348 unit-period comparisons with zero cent-level unit-charge mismatches. TB810's six-decimal returned/displayed rate is acceptable.
- **Carlos Gas provenance:** Carlos receives a read-only view of the exact constituent Gas supplier bills included in the live package/calculation. The bills come from canonical package inputs/provenance. Carlos does not add, reject, exclude, replace, or otherwise curate the supplier pool during the First Ride. Pool curation and recalculation are post-MVP.

### K — September -> October REAL cycle — FIRST RIDE CHECKPOINT

#### K1 — Clean starting state

Before the real ride, authoritative history through August must be clean enough to support the cycle, stale development/test obligation packages must not contaminate September or October, and September must be available as the real operational source month.

#### K2 — Giuliana enters actual September facts

Use real building inputs, not fixtures or demo values:

- actual Sedapal/Common Water bill
- all 64 actual Unit Water readings
- actual applicable Gas readings
- actual Gas supplier-bill facts where relevant
- actual Unit/Owner charges relevant to October

The intake workflows must be usable enough for Giuliana to perform this herself.

#### K3 — October unblocks naturally

Do not manually manufacture Ready state. As required source work is completed, TB810 should progress naturally from Missing / Building / Blocked to Ready and make the remaining blockers obvious.

#### K4 — Legacy parity validation

Before the Carlos demo, independently reproduce the legacy October calculation from the exact same real September facts. Compare TB810 October with Legacy October at component, unit, owner where applicable, and grand-total levels. Relevant components include Water, Gas, regular/common obligations, Unit Charges, and Owner-direct charges. Do not accept unexplained differences; matching only the grand total is insufficient.

#### K5 — Monthly beat / Pulse — PROVEN IN DEV

Financial readiness and handoff eligibility remain separate. A ready package is
quiet while calendar-ineligible; at the appropriate boundary Pulse makes it
eligible for handoff. The November 1, 2026 controlled proof confirmed this
behavior, with October still awaiting Carlos while November handed off and
December became the active successor. Do not bypass Pulse merely to make the
demo work.

#### K6 — Carlos review + approval

Carlos should receive a quiet, credible October package showing approval readiness, source-work completion, package total, relevant component/unit/owner detail, and genuine financial exceptions. He should recognize that TB810 matches the trusted legacy calculation, then approve the package.

## Demo Story

> “Rather than walking through features, we are showing one month in the life of the building and how TB810 coordinates Giuliana’s work with Carlos’s.”

The product should tell this story directly:

- Giuliana enters real source facts, sees October become complete, reaches the monthly boundary, and hands off through Pulse.
- Carlos receives the completed October package, recognizes the numbers, reviews, and approves.

Avoid turning the demo into a tour of screens.

## 4–5 Day Critical Path

### B2.5 Slice A Status — CLOSED / ACCEPTED / FROZEN

Slice A implements the primary Unit Water monthly intake contract:

- the active-month workspace can generate the canonical `DEP-{unit_number}` / `Lectura` workbook;
- upload parses and validates without writing readings;
- a complete valid batch is reviewed with derived Previous and Consumption values;
- one confirmed batch Reading Date is required and must belong to the selected month;
- confirmation uses the canonical `tb810_meter_readings` month identity and one atomic persistence operation;
- active DEV sessions use the transactional Unit Water import journal wrapper for exact reset ownership.

Slice A is accepted for the First Ride. Further work belongs only in the current Gas, October proof, handoff, or Carlos milestones above.

1. Validate the current Gas Supplier Bills milestone using real September needs.
2. Enter the remaining real September source facts.
3. Validate the October obligation calculation against legacy.
4. Fix only discrepancies or blockers that prevent parity or the operational ride.
5. Validate Pulse/handoff at the month boundary.
6. Validate the Carlos review/approval experience.
7. Rehearse the complete Giuliana -> Carlos story.

This order may change if a direct blocker to the First Ride is discovered.

## Explicitly Deferred Unless They Block the First Ride

Do not allow these to consume the next 4–5 days unless they directly block the October checkpoint:

- perfect historical Gas reconstruction
- generalized historical repair tooling
- broad historical obligation reconstruction
- historical importer refactor
- generalized force-reset infrastructure
- deep approved-snapshot archaeology
- generalized snapshot redesign
- invoice generation and dispatch
- supplier PDF/image storage and OCR
- Gas-cylinder inventory management
- owner Gas statements
- payment allocation
- Gas debt/aging
- bank deposit and collection workflows
- advanced reconciliation/reporting
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
- [x] Pulse behaves correctly at the monthly boundary.
- [ ] Giuliana can hand October to Carlos.
- [ ] Carlos receives the correct October package.
- [ ] Carlos can inspect the package without confusing live and recomputed information.
- [ ] Carlos can approve October.
- [ ] The complete Giuliana -> Carlos workflow can be demonstrated coherently as one monthly operational story.

## Working Principle

> “Build what makes the October ride credible. Fix what blocks the ride. Defer what does neither.”

> “Authoritative operational and historical data should be protected. Development/test artifacts may be surgically removed when they interfere with establishing the correct operational state.”
