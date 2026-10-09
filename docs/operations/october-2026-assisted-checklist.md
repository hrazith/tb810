# October 2026 Assisted Obligations — UI Operations Log

Persistent checklist of the operations needed to close October 2026 as an **Assisted Obligations** month, ahead of November 2026, the first No Training Wheels cycle.

Policy source: [`docs/domain-models/unit-charges.md`](../domain-models/unit-charges.md) (frozen October 2026 policy).

Last updated: October 9, 2026.

**Status meanings**
- **Investigating:** facts still being established.
- **Blocked:** waiting on a decision.
- **Ready for UI:** facts and decision settled; an operator can perform it in TB810.
- **Completed:** performed in TB810 and verified.

Documentation work and UI or data operations are tracked separately. An item is **Completed** only once the TB810 operation is done and verified. Documentation alone never completes an item.

## Summary

| # | Operation | Status | Documentation | UI / data operation |
|---|---|---|---|---|
| 1 | Bulk Bono empleados, PEN 22 × 64 apartments | Completed | Done | Done; verified October 9, 2026 |
| 2 | Six "Otros" charges | Completed | Done (evidence below) | Done; verified October 9, 2026 |
| 3 | Informational notes for discontinued historical charges (904, EST-13, EST-42) | Blocked | Done (policy) | Not done; the three Unit notes are pending, and no mechanism exists yet |
| 4 | Ownership discrepancies: DEPOS-41 and EST-10 | Completed | Done (evidence below) | Done; verified October 9, 2026. EST-10 credit #22 is recorded, not yet applied |
| 5 | Water rate and rounding policy | Completed | Done (decision recorded October 9, 2026) | Not needed; the current calculation already applies the decision |
| 6 | Validate October obligations against Carlos's issued receipts | Completed | Done (reconciliation of Oct 9) | Done; PEN 0.00 unexplained |
| 7 | Mark October as issued outside TB810, without redispatch | Blocked | Done (cutover comment below) | Not done; the comment isn't recorded in TB810 yet. No-reissue is a manual rule only. |

## Unit Charges lifecycle gate correction (October 8, 2026)

**Defect.** Unit Charges could only start from the calendar month after today (`nextMonth(currentMonth)`), with an exception for the latest `ready_for_review` package. During October 2026, October was still Giuliana's active, un-handed-off package, yet October charges were rejected ("Start month cannot be before 2026-11"). Items 1 and 2 could not be entered.

**Correction** (`server/charges/index.ts`). Editability now follows the package lifecycle:
- **Rule.** A month is editable when it is at or after Giuliana's active package, read once per operation from the canonical `loadGiulianaPackageProgression` with the same operating month as the Obligations workspace. For Unit Charges, the latest `ready_for_review` package is also editable.
- **Scope.** One rule (`isChargeMonthEditable`) governs single-Unit, Owner and bulk creation, editing, deletion, economics changes and stopping.
- **Frozen periods.** Approved and closed packages are never editable. A `ready_for_review` correction must stay in its obligation month, and only a single-month charge can be removed from a handed-off package. Both rules are unchanged.
- **Removed.** The calendar helper `defaultStartMonthForNewCharge`, the duplicate `validateFutureChargeInput`, and the separate `ready_for_review` query.
- **Out of scope.** No schema, migration, obligation-calculation, Gas, snapshot or approval-fingerprint change, and no live data change.

**Verification.**
- Focused tests: `node --test server/charges/*.test.mjs`, 23/23 pass. They cover:
  - a live October package accepting Unit, Owner and bulk charges before handoff;
  - editability depending only on the progression, never the calendar;
  - the latest `ready_for_review` package staying correctable for Unit Charges only;
  - approved and earlier packages rejected for every target;
  - future creation, edits and series deletes unchanged;
  - recurring charges with no end month accepted and eligible in every later month.
- Full node suite: 442 tests, 0 failures (432 pass, 10 todo). `tsc --noEmit` and eslint are clean.

**Caveat (superseded October 9, 2026 by FIN-008, the [Dual-Clock Monthly Operating Model](../architecture/monthly-operating-model.md)).** An unfinished package stays the active obligation package after the calendar moves on. The progression-anchor migration `20261009130000` implements this, but it is not yet applied live, so until then the caveat below still describes live behavior. Original caveat: Progression starts from the current business month. If the calendar reaches November while October is still un-handed-off, progression reports November as active. The Obligations workspace then moves to November, and October charges are no longer editable. This matches what Giuliana sees, so enter the October charges during October.

No charges were created as part of this correction.

## October Unit Charges verification (October 9, 2026)

This read-only check covered items 1 and 2.
- **Charges.** `tb810_charges` holds 70 rows, all Unit Charges and all eligible for October: 64 Bono and 6 Otros, totalling **PEN 1,588.00**. There are no Owner-direct charges, and each charge counts exactly once.
- **October package state.** October 2026 has no billing period, so it is live, unapproved and has no persisted obligation rows. The dashboard shows "Ready for handoff". September 2026 remains `approved`.
- **Totals (dashboard).** Fixed assessments PEN 20,051.80, Metered water PEN 2,709.46, Common water PEN 51.20 and Gas PEN 1,840.04 are unchanged from the October 8 reconciliation. Other charges are PEN 1,588.00 and Owner-direct charges PEN 0.00. **Total: PEN 26,240.50** (PEN 24,652.50 + 1,588.00).

## 1. Bulk Bono empleados

| Field | Detail |
|---|---|
| Operation | Create the Bono empleados Unit Charges in the existing Unit Charges workflow (bulk) |
| Units / receipts | All 64 apartments (condo Units), **Unit 904 included** |
| Expected outcome | 64 × PEN 22.00 = **PEN 1,408.00**, under one grouped charge set with description `Bono empleados`, in the `other_charge` component (not the fixed assessment). October total becomes PEN 24,652.50 + 1,408.00 = PEN 26,060.50. |
| Status | **Completed.** Entered through the Unit Charges bulk workflow on October 9, 2026 (after the October 8 lifecycle gate correction), and verified the same day. |
| Verification (October 9, 2026, read-only) | `tb810_charges` holds exactly 64 `Bono empleados` rows: PEN 22.00 each, recurring, effective October 2026 to December 2026 (`effective_to_month` 2026-12-01). They cover all 64 condo Units, Unit 904 included, one row per Unit with no duplicates. No parking or storage Units and no Owner-direct rows are included. Monthly total: **PEN 1,408.00**. The bulk RPC gives each Unit its own `series_id` (64 series), by design. |
| Evidence / verification | Frozen policy in `unit-charges.md`. Verify afterwards: 64 charges, PEN 1,408.00 in the October `other_charge` component, and fixed assessments unchanged at PEN 20,051.80. |
| Outstanding decision | **Charge shape** (not blocking): one recurring charge from October to December 2026, or one-off charges per month. The amounts are the same either way; recurring October–December matches the policy period. |

## 2. Six "Otros" charges (PEN 30.00 each)

**Evidence.** The October register `Administrador Torre Balta-2.xlsx` (sha256 `ae1066fc…`) gives only the amount (`Otros` = 30.00), with no description. The legacy `other_charges` table, identical in all three legacy dumps (`legacy/data/torrebal_admincondo.sql`, `localhost.sql`, `localhost-2.sql`, Sep 21–28), supplies the descriptions. The legacy `detail_bills` history supplies the monthly billing.

| Receipt | Unit in legacy | Exact legacy description | Type | Legacy record | Billing history | Recurrence |
|---|---|---|---|---|---|---|
| 4789 | DEP-202 (legacy unit 13) | `Lavanderia` | laundry | #4, created 2023-11-06, expires **2029-12-31** | every month 2024-08 → 2026-09, plus earlier periods (2021-04 → 2022-04; 2023-11 → 2024-10) | recurring monthly |
| 4794 | DEP-301 (unit 18) | `Servicio porteria a Empresas` | porter service for companies | #5, created 2023-11-06, expires **2029-12-31** | every month 2023-11 → 2026-09 (35 months) | recurring monthly |
| 4807 | DEP-504 (unit 33) | `lavanderia` | laundry | #6, created 2023-11-06, expires **2029-12-31** | every month 2023-11 → 2026-09 (35 months) | recurring monthly |
| 4810 | DEP-602 (unit 37) | `Lavanderia deposito 19` | laundry, referencing storage DEPOS-19 | #14, created 2024-09-02, expires **2030-02-28** | every month 2024-09 → 2026-09 (23 months, plus 2 on an earlier receipt layout) | recurring monthly |
| 4818 | DEP-802 (unit 47) | `Lavanderia` | laundry | #7, created 2023-11-06, expires **2029-12-31** | every month 2023-11 → 2026-09 (35 months) | recurring monthly |
| 4822 | DEP-902 (unit 51) | `Lavanderia` | laundry | #8, created 2023-11-06, expires **2029-12-31** | every month 2023-11 → 2026-09 (35 months) | recurring monthly |

| Field | Detail |
|---|---|
| Operation | Enter the six charges as Unit Charges, if they continue |
| Units / receipts | DEP-202 (4789), DEP-301 (4794), DEP-504 (4807), DEP-602 (4810), DEP-802 (4818), DEP-902 (4822) |
| Expected outcome | 6 × PEN 30.00 = PEN 180.00 a month in `other_charge`. Each would be a recurring Unit Charge with the exact legacy description, starting at the agreed month. |
| UI capability | **Representable.** The Unit Charges UI takes a Unit, description, non-zero amount, one-off or recurring schedule, and start and end months. A recurring PEN 30.00 charge per Unit fits. The legacy expiry dates (2029/2030) are planned end dates, not proven service ends. |
| Status | **Completed.** Entered through the Unit Charges workflow on October 9, 2026 and verified the same day. They were continued on the strength of the historical recurring billing evidence above, and entered through the UI with the user's authorization. **Carlos has not independently confirmed them.** His open questions below remain open. |
| Verification (October 9, 2026, read-only) | Exactly one recurring PEN 30.00 Unit Charge per Unit, effective from October 2026 with no end month and no stop note: DEP-202 `Lavanderia`, DEP-301 `Servicio porteria a Empresas.`, DEP-504 `Lavanderia`, DEP-602 `Lavanderia deposito 19`, DEP-802 `Lavanderia`, DEP-902 `Lavanderia`. Monthly total: **PEN 180.00**. The DEP-301 description is stored with a trailing period, which was left as entered. All six are attached to the Unit, as in legacy. DEPOS-19's laundry is charged to DEP-602. |
| Evidence / verification | Legacy `other_charges` #4–#8 and #14, and `detail_bills` history through 2026-09 (the last month in the dumps). The legacy evidence matches the October receipt Units one to one. |
| Outstanding decisions (Carlos) | 1. Do all six continue in TB810, for October and from November? 2. Should `Servicio porteria a Empresas` (DEP-301) be a Unit Charge or an Owner Direct Charge? Legacy attaches it to the Unit. 3. Should `Lavanderia deposito 19` be charged to DEP-602, as legacy does, or to DEPOS-19? Both are on the same owner's receipt. 4. Are the 2029/2030 expiry dates real end dates, or open-ended placeholders? |

## 3. Informational notes for discontinued historical charges

| Field | Detail |
|---|---|
| Operation | Attach an informational, non-financial note to each affected October obligation |
| Units / receipts | Unit 904 (PEN 10.00, receipt 4824), EST-13 (PEN 8.40, receipt 4851), EST-42 (PEN 8.00, receipt 4834) |
| Expected outcome | Each October obligation shows the historical charge, its amount, and "discontinued effective October 2026". No charge, credit or reversal is created, and amounts are unchanged. |
| Status | **Blocked:** TB810 has no mechanism yet for non-financial notes on obligations. |
| Evidence / verification | Frozen policy in `unit-charges.md`. The October reconciliation confirms these amounts are on the issued receipts (PEN 26.40 in total). |
| Outstanding decision | Where the note lives: an obligation annotation, a reconciliation note, or display-only text. It must not be modeled as a charge. This is a UI and implementation task. |

## 4. Ownership discrepancies

| Field | DEPOS-41 | EST-10 |
|---|---|---|
| TB810 before correction | **No ownership record**, so its PEN 25.47 fixed assessment belonged to no owner | Owner Karina Merino Peñafiel (OWN-000038) since 2026-08-01, open-ended |
| TB810 after correction | **Randy Russell Civello (OWN-000056) from 2026-10-01**, open-ended. The ownership note cites legacy assignment #181 and billing from November 2023 to September 2026. Legacy #179 was an inactive, deleted placeholder that was never billed. | Karina's row ends **2026-08-31**. **Telmo Salazar Gonzales y Carmen Lopez (OWN-000087) from 2026-09-01**, open-ended, linked to legacy assignment #205. The change is recorded in `tb810_audit_logs` (`reconcile`). |
| September 2026 attribution | **Remains unassigned in TB810.** The approved September row (fixed assessment PEN 25.47) is held on the Unit Account with no owner. Legacy billed it to Randy. October 1 is the TB810 attribution date, not his acquisition date, which is unknown. | **Matches legacy.** The approved September EST-10 row (PEN 42.32) is attributed to Telmo and Carmen, as on legacy receipt DEP-506-EST-10-SET-2026. September is the billing-effective month, and the actual sale date is unknown. |
| October 2026 attribution | Randy: DEP-1302 and DEPOS-41 (+PEN 25.47) | Telmo and Carmen: DEP-506 and EST-10 (+PEN 42.32). Karina: DEP-801, EST-9 and DEPOS-34 |
| Legacy / issued | Billed with DEP-1302 to legacy owner 58 (Randy Russell Civello) every month of 2026 through September; October receipt 4835 | Billed with DEP-801 to Karina Merino Peñafiel (legacy owner 40) January–August 2026, then **moved to DEP-506** under Telmo Salazar Gonzales y Carmen Lopez (legacy owner 89) from September 2026; legacy `owner_unit` now assigns EST-10 to owner 89; October receipt 4863 |
| Related evidence | — | Legacy credit #22 (EST-10): −42.32, "PAGO DOS VECES EL ESTACIONAMIENTO 10 SE LE DESCONTARA AL MES SIGUIENTE SOLO 1 VEZ", created 2026-09-16, expires 2026-10-01. **It does not appear on any October receipt.** Now recorded on EST-10's Permanent Unit Account; see "EST-10 legacy credit #22" below. |
| Expected outcome | DEPOS-41 owned by Randy Russell Civello for October | EST-10 transferred to Telmo Salazar Gonzales y Carmen Lopez from the confirmed date |
| Status | **Completed** (October attribution), effective 2026-10-01 | **Completed**, effective 2026-09-01 |
| Outstanding | None for October. Whether August–September 2026 should ever be attributed to Randy is optional history, not required for the cutover. | None for ownership. Credit #22 is recorded and **pending application in November** (see below). |
| Building totals | Unchanged: ownership changes only reassign Units between owners. October PEN 26,240.50; approved September PEN 23,553.75. | Same |

Ownership changes go through the ownership-transfer workflow, not through Unit edits or charges.

### EST-10 legacy credit #22

| Field | Detail |
|---|---|
| Decision (frozen) | Carlos approves **gross** monthly obligations. Available Permanent Unit Account credits are applied afterwards, when the net payable is worked out. Applying a credit never changes an approved obligation. Credits belong to the Unit Account, and the current owners benefit. |
| Evidence | Legacy `other_charges` #22 on EST-10 (legacy unit 85): −42.32, created 2026-09-16 by Junior Ayllon, expires 2026-10-01, never deleted. It appears on **no** legacy bill: it was created after the September bill was issued and paid. October receipt 4863 (DEP-506-EST-10-OCT-2026) charged EST-10 in full and was paid. Related legacy payment #1575 (2026-09-15, owner 40). |
| TB810 record | `tb810_credits` `671bf8bf-4cf5-4774-9c70-42bfbe9427de` on EST-10 Unit Account `d04e4176-f8e4-4cc6-903b-b1f8710978aa`. Amount PEN 42.32, remaining PEN 42.32, status **active**, source `other`, legacy reference `other_charges` #22, with the original description and dates in `legacy_metadata`. Recorded October 9, 2026. |
| Not done (by design) | No ledger entry, no consumption, and no change to obligations, assessments, payments, allocations, ownership or October receipts. Obligations stayed at 358 rows / PEN 23,553.75, and charges at 70 / PEN 1,588.00. |
| Beneficiary | EST-10's current owners, Telmo Salazar Gonzales y Carmen Lopez (OWN-000087) |
| Intended application | November 2026 net payable, reducing the EST-10 amount payable by PEN 42.32. The November obligation stays at its gross amount. |
| Status | **Active, not consumed:** PEN 42.32 recorded, PEN 42.32 remaining. |
| Pending before November dispatch | 1. **How the credit is applied in November:** TB810 doesn't yet calculate the net payable or mark a credit as used. Build that, or apply it by hand on the November receipt and record it as used afterwards. 2. **Ledger sign rule:** the database requires a `credit` ledger entry to be positive, the same sign as a charge. Decide the rule before writing the first entry. |

## 5. Water rate and rounding policy

| Field | Detail |
|---|---|
| Operation | Decide the Water unit-price convention before November |
| Units / receipts | All 64 apartments |
| Expected outcome | Either TB810 keeps the precise rate (October: PEN 4.253467/m³), or it reproduces the legacy convention of rounding the price to 2 decimals (PEN 4.25/m³) before multiplying. October difference: PEN 2.21 (TB810 higher), across 50 receipts. |
| Status | **Completed.** Decision confirmed on October 9, 2026: TB810 keeps the full-precision rate from November 2026 onward. No TB810 change was needed, because the current calculation already applies it (`server/water/index.ts`). |
| Evidence / verification | October reconciliation: the legacy convention reproduces all 64 apartment receipts exactly. The resolution is recorded in [`september-2026-legacy-parity.md`](../migrations/september-2026-legacy-parity.md) and in the AGUA rule in [`tb810-water-domain.md`](../tb810-water-domain.md). |
| Documentation | The three October rounding differences are explained in Help, at `/help/obligations#legacy-reconciliation` ([`app/(staff)/help/obligations/page.tsx`](../../app/(staff)/help/obligations/page.tsx)): Water rate TB810 +PEN 2.21, fixed-assessment rounding TB810 +PEN 0.05, and receipt rounding legacy +PEN 0.20 net. Help separates the current TB810 policy, the legacy conventions, and the confirmed policy from November. Documented October 9, 2026. |
| Outstanding decision | None for the Water rate. Legacy fixed-assessment rounding per receipt (PEN 0.05 in October) and receipt-total rounding to PEN 0.10 (PEN 0.20 in October) are legacy conventions only. TB810 does not apply them, and no change has been requested. |

## 6. Validate October against Carlos's issued receipts

| Field | Detail |
|---|---|
| Operation | Re-run the receipt-by-receipt reconciliation once items 1–5 are done |
| Units / receipts | 77 receipts, PEN 24,402.80 |
| Expected outcome | Every remaining non-Gas difference is intentional and explained: Unit 904's Bono (+22.00, by policy), the discontinued adjustments (−26.40), any "Otros" decided not to continue, and the rounding conventions. Gas is the only addition, PEN 1,840.04. |
| Status | **Completed** (October 9, 2026) |
| Evidence / verification | **Reconciliation of 2026-10-09.** TB810 per-Unit October rows were built by the canonical calculation in read-only mode; they reproduce the dashboard. They were compared with Carlos's register `Administrador Torre Balta-2.xlsx` (sha256 `ae1066fc…`). Results:<br>• **77 legacy receipts cover all 172 Units, each exactly once.** Every receipt matches a single TB810 owner, including the corrected DEPOS-41 and EST-10.<br>• Legacy receipts: **PEN 24,402.80**.<br>• TB810 excluding Gas: **PEN 24,400.46**.<br>• Difference: **PEN 2.34**, fully explained by confirmed policies and legacy rounding (below).<br>• TB810 Gas: **PEN 1,840.04**, not on legacy receipts.<br>• TB810 October total: **PEN 26,240.50**.<br>• **Unexplained: PEN 0.00.** |
| Difference by cause (legacy minus TB810) | Discontinued adjustments on 904, EST-13 and EST-42: +26.40 (policy). Bono on Unit 904, charged by TB810 only: −22.00 (policy). Receipt totals rounded to PEN 0.10: +0.20 across 70 receipts (legacy convention). Fixed-assessment rounding per receipt: −0.05 across 19 receipts, ±0.01 each (legacy convention). Water rate rounded in legacy, full precision in TB810: −2.21 across 49 receipts (confirmed policy). Otros and the Bono on the other 63 apartments: 0.00. **Total +2.34.** |
| Bridge | Issued 24,402.80 → −0.20 receipt rounding → −26.40 discontinued adjustments → +22.00 Bono on 904 → +0.05 fixed rounding → +2.21 Water rate → TB810 excluding Gas 24,400.46 → +1,840.04 Gas → **26,240.50** |
| Owner-level exceptions | Only three receipts differ by more than rounding, each explained by policy: 4824 (904: adjustment +10.00, Bono −22.00), 4834 (EST-42: adjustment +8.00) and 4851 (EST-13: adjustment +8.40). Every other receipt is within ±PEN 0.15 (Water rate and rounding). Four owners have more than one legacy receipt (Julio Poterico Rojas 4; Carlos Paz Guerrero, Sergio Antonio Rios Cuellar and Virginia Barandiaran Pagador 2 each). That's legacy receipt grouping, not a financial difference. |
| Outstanding decision | None. This supersedes the October 8 reconciliation, which predated the Bono, Otros and ownership corrections. |

## 7. Mark October as issued outside TB810

| Field | Detail |
|---|---|
| Operation | Close October 2026 in TB810 as issued externally, so it is never dispatched and November becomes the active package |
| Units / receipts | October 2026 package (not yet created in TB810) |
| Expected outcome | October recorded as Assisted Obligations, issued outside TB810. No redispatch. November becomes Giuliana's active package. |
| Status | **Blocked:** TB810 has no "issued outside TB810" state or workflow yet. Today October is the active package, shown as "Ready for handoff", and November cannot open until October is closed. Unit Charges for October can be entered now, while October is active (see the lifecycle gate correction above). |
| Evidence / verification | Frozen policy (October = Assisted Obligations; November = first NTW cycle); package progression read on 2026-10-08 |
| Outstanding decision | How to represent "issued externally" in the package lifecycle without dispatch. This is a product and implementation decision. |
| Cutover comment | Recorded in this checklist (see "October 2026 assisted-cutover comment" below). **Not yet recorded in TB810.** The closest existing field is `tb810_billing_periods.notes`, but October 2026 has no billing-period row yet (one is created at handoff), and no screen writes that field. Item 7 stays pending until the comment is recorded through an existing application mechanism. No new status or lifecycle is introduced. |

## October 2026 assisted-cutover comment

> Carlos issued October 2026 receipts through the legacy system. All 77 receipts covering 172 Units have been reconciled against TB810, with PEN 0.00 unexplained differences. TB810 includes PEN 1,840.04 Gas not present on legacy receipts. October receipts must not be reissued. November begins TB810-native billing.

**No-reissue is a manual operational rule, not an enforced system restriction.** TB810 doesn't currently stop October from being handed off, approved or dispatched. Until item 7 is resolved, staff must make sure October 2026 receipts are not issued again through TB810.
