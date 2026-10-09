# Unit Charges Domain

Canonical reference for Unit Charges in TB810: what they are, the business rules agreed for the 2026 cutover, and what is implemented.

Status date: October 8, 2026. The October 2026 Assisted Obligations policy is frozen (section 2).

## 1. What a Unit Charge is

A Unit Charge is an explicit, explained amount added to a Unit's Monthly Obligation, outside the budget-based fixed assessment.

These semantics are frozen (see [`development-milestones.md`](../development-milestones.md) and [`october-2026-first-ride.md` §12](../migrations/october-2026-first-ride.md)):

- **A Unit Charge belongs to a Unit.** It is billed to whoever owns that Unit for the obligation month.
- **An Owner Direct Charge belongs to an Owner** and does not depend on a Unit.
- **Every charge needs an explanatory comment,** including charges created in bulk.
- **Bulk-created charges stay grouped.** A group must be reviewable, editable and removable as a whole before approval.
- **After approval, reviewed financial facts are never silently changed.**

### Separation from fixed assessments

- The **fixed assessment** comes from the Budget Plan: monthly budget × participation percentage, rounded to the céntimo (see [`budget-plans.md`](budget-plans.md)). It is a separate component.
- A **Unit Charge** never alters the fixed assessment or the budget. It is reported in the Monthly Obligation's `other_charge` component (see [`monthly-obligations.md`](../architecture/monthly-obligations.md)).
- The legacy system folded adjustments into its fixed line through `units.bill_adjustment`. TB810 does not reproduce that field. Each surviving legacy adjustment is translated by meaning: a Unit Charge, an Owner Direct Charge, or a budget decision. It is never copied over generically.
- Legacy Unit notes describing these adjustments are imported history, not charge records (see [`units.md`](units.md)).

## 2. Approved business rules (Carlos-confirmed)

| # | Rule | Effective |
|---|---|---|
| 1 | **Bono empleados:** PEN 22.00 per apartment (condo Unit) per month, **including Unit 904**. 64 apartments, so PEN 1,408.00 a month. Explanatory comment: `Bono empleados`. One grouped charge set. | October, November and December 2026 |
| 2 | **Bono empleados from 2027:** it becomes part of the regular budget (the 2027 Budget Plan), **not** a separate Unit Charge. No Bono Unit Charge applies from January 2027. | January 2027 onward |
| 3 | **EST-13:** its historical PEN 8.40 adjustment is **discontinued in TB810 from October 2026**. It appeared on Carlos's externally issued October receipt but is not a TB810 charge. | from October 2026 |
| 4 | **EST-42:** its historical PEN 8.00 adjustment is **discontinued in TB810 from October 2026**, likewise. | from October 2026 |
| 5 | **Unit 904:** its historical PEN 10.00 adjustment is **discontinued in TB810 from October 2026**, likewise. From October, 904 has only the Bono empleados PEN 22.00 charge (rule 1). | from October 2026 |
| 6 | **October 2026 is an Assisted Obligations month.** Carlos issued the receipts outside TB810. TB810 reconciles October against those receipts and explains intentional differences. October must **not** be dispatched again through TB810. | October 2026 |
| 7 | **November 2026 is the first No Training Wheels operating cycle**, the first billed by TB810. | November 2026 |

### October 2026: Assisted Obligations policy (frozen)
- **Bono empleados:** PEN 22.00 for each of the 64 apartments, **Unit 904 included**, PEN 1,408.00 in total. It is shown as a separate Unit Charge, never inside the fixed assessment, and entered through the existing Unit Charges workflow.
- **Historical adjustments:** 904's PEN 10.00, EST-13's PEN 8.40 and EST-42's PEN 8.00 are **not** charged by TB810 from October 2026. Do not insert artificial historical charges to force parity with the issued receipts.
- **Required informational explanation:** each affected October obligation (904, EST-13, EST-42) must carry a note identifying the historical charge, its amount, and its discontinuation from October 2026. The note is informational only: it creates **no charge, credit or reversal** and does not change any amount.
- **Known differences from the issued October receipts:** these are intentional and are explained, not corrected.
  - Carlos's receipt for 904 had the PEN 10.00 adjustment and no Bono. TB810 has the PEN 22.00 Bono and no adjustment.
  - The EST-13 and EST-42 receipts include adjustments that TB810 does not charge.
  - See the reconciliation in section 3.

### What applies to November and December 2026
- Bono empleados: PEN 22.00 for each of the 64 apartments, 904 included.
- No EST-13, EST-42 or Unit 904 PEN 10 adjustment.
- No other Unit Charge has been agreed.

These rules supersede the "OPEN; do not carry automatically" entries for Unit 904, EST-13 and EST-42 in [`october-2026-first-ride.md` §10 and §17](../migrations/october-2026-first-ride.md). Background on the legacy amounts is kept there.

## 3. Current implementation status

| Item | Status |
|---|---|
| Unit Charge storage | `tb810_charges` ([`20260812120000_create_tb810_charges.sql`](../../supabase/migrations/20260812120000_create_tb810_charges.sql)): Unit or Owner, description, amount, `one_off` or `recurring` schedule, effective-from and effective-to months, `series_id` for grouped charges, stop note |
| Application | `server/charges` (single and bulk creation, month eligibility, lifecycle); charges flow into the `other_charge` obligation component |
| **Live Unit Charges** | **None.** `tb810_charges` had 0 rows as of October 8, 2026 |
| Bono empleados, October–December (rule 1) | **Not entered yet.** Data entry through the Unit Charges workflow is a separate task. |
| Historical adjustments (rules 3–5) | Correctly absent: no TB810 charge should exist for them |
| October informational explanations (904, EST-13, EST-42) | **Not implemented.** The UI is a separate task, and no storage or display for informational, non-financial notes on obligations has been chosen yet. |
| 2027 budget treatment (rule 2) | Not yet relevant; the 2027 Budget Plan does not exist yet |
| October 2026 in TB810 | Calculated without Unit Charges: PEN 24,652.50 including Gas, PEN 22,812.46 without. October has no TB810 package. It must not be dispatched, and how to close it in TB810 as an Assisted Obligations month is still a separate decision. |

### October reconciliation against the issued receipts (October 8, 2026)
Carlos's register lists 77 receipts, PEN 24,402.80. Once the frozen policy applies, the expected differences from TB810 are:

| Difference | Amount (PEN) | Classification |
|---|---:|---|
| Bono empleados issued on 63 apartments; TB810 policy charges all 64 (904 included) | TB810 +22.00 | intentional (policy) |
| 904, EST-13 and EST-42 historical adjustments on the receipts, discontinued in TB810 | receipts +26.40 | intentional (policy), explained by the informational notes |
| Receipt "Otros" (laundry and porter service) on 6 receipts | receipts +180.00 | still open: how to represent them in TB810 is undecided |
| Water rate: legacy rounds the unit price to 4.25 before multiplying | TB810 +2.21 | intentional (policy): TB810 keeps the precise rate, confirmed October 9, 2026 ([`september-2026-legacy-parity.md`](../migrations/september-2026-legacy-parity.md)) |
| Fixed-assessment rounding: legacy rounds per receipt, TB810 per Unit | TB810 +0.05 | proven convention |
| Receipt totals rounded to PEN 0.10 | receipts +0.20 | proven convention |
| Gas (not on legacy receipts) | TB810 +1,840.04 | intentional addition |

Ownership differences found by the same reconciliation:
- **DEPOS-41** has no TB810 owner; legacy bills it to Randy Russell Civello.
- **EST-10** belongs to Karina Merino Peñafiel in TB810; legacy bills it to Telmo Salazar Gonzales y Carmen Lopez.

These are ownership-data issues, not Unit Charge rules.

## 4. Open questions

1. **Charge shape.** The rules don't say whether Bono empleados should be one grouped recurring charge (October–December) or a one-off charge per month. The amounts are the same either way. Its explanatory comment should read `Bono empleados`.
2. **Where the informational October notes live.** The policy requires a non-financial explanation on the 904, EST-13 and EST-42 October obligations. The mechanism (obligation annotation, reconciliation note or display-only text) is a UI and implementation decision, and it must never be modeled as a charge or credit.
3. **Otros (PEN 180.00).** Six recurring monthly PEN 30.00 legacy charges: `Lavanderia` on DEP-202, DEP-504, DEP-802 and DEP-902; `Lavanderia deposito 19` on DEP-602; and `Servicio porteria a Empresas` on DEP-301. Still undecided: whether they continue in TB810, and whether the porter service is a Unit Charge or an Owner Direct Charge. The evidence and open questions are in [`docs/operations/october-2026-assisted-checklist.md`](../operations/october-2026-assisted-checklist.md), the October operations log.
