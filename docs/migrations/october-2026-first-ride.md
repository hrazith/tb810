# October 2026 First Ride - Migration & Cutover Record

October 2026 is TB810's intended first native obligation lifecycle.

This document records the known financial and operational state of the building immediately before that cutover. It is the historical migration ledger for First Ride, not a replacement for the general TB810 architecture documentation.

## 1. Cutover Boundary

| Period | Meaning | Authority |
| --- | --- | --- |
| August 2026 | Final authoritative legacy Water/Sedapal source cycle used for September legacy obligations | Legacy |
| September 2026 | Final legacy-generated obligation month; native TB810 source-work month | Legacy obligations plus native source facts |
| October 2026 | First intended native TB810 obligation lifecycle and First Real Ride | TB810 |

```text
August legacy source facts -> September legacy obligations

CUTOVER

September native TB810 source facts -> October native TB810 obligations
```

September must not be retroactively manufactured as a native Giuliana -> Pulse -> Carlos -> approval -> snapshot cycle merely to make lifecycle state appear complete.

## 2. Authoritative Legacy Source

**LEGACY FACT**

The authoritative source is [`legacy/sql/torrebal_admincondo.sql`](../../legacy/sql/torrebal_admincondo.sql), a fresh production export obtained September 28, 2026. The former `legacy/sql/localhost.sql` is not authoritative.

Historical workbooks and import artifacts are supporting evidence only. They do not replace the production export.

## Historical Data Integrity Gates

The Jan-August historical mirror principle is frozen: TB810 historical facts must match the authoritative Legacy export unless an intentional transformation or policy difference is explicitly documented.

Historical truth includes documented gaps in the authoritative Legacy source. TB810 must not manufacture values merely to make a historical dataset structurally complete.

Historical-data status:

- [x] July 2026 Unit Water contamination was restored from authoritative Legacy on September 30, 2026 (`429.997` contaminated aggregate versus `709` authoritative aggregate). The repaired set is 64/64 and matches Legacy row-for-row.
- [x] Historical Gas import integrity is verified: 452 populated Jan-Aug readings in Legacy and TB810 match after the importer's established three-decimal normalization; there are no duplicate unit-month groups and no synthetic historical Gas readings.
- [x] The 12 missing Gas cells are confirmed blank in the authoritative Legacy workbook and are documented as a Legacy source gap, not a TB810 import defect.
- [ ] Remaining effective-ownership provenance cases must be resolved or explicitly documented.

The Legacy Gas source gap remains documented and open for future evidence, but it is not a blocker to First Ride. These historical findings do not change the September lifecycle rehearsal dependency.

The missing cells are in `legacy/data/gas/ConsumoDeGas-25-26-USAR.xlsx`, sheet `Lecturas`:

- Unit 306, meter `2034050.0`: February, March, April, May, June, and August 2026.
- Unit 804, meter `GA170800161`: February, March, April, May, June, and August 2026.

Continuity evidence is Unit 306: December 2025 `240.741`, January 2026 `0`, July 2026 `0.0`; and Unit 804: December 2025 `11.524`, January 2026 `0`, July 2026 `0.0`. The January decreases are not characterized as confirmed meter resets because the available evidence does not establish their cause.

## 3. Building and Unit Baseline

**LEGACY FACT**

- 172 total units
- 64 condos
- 60 parking units
- 48 storage units
- Participation percentages are sufficiently reconciled for the current obligation work.

Ownership/provenance follow-up remains open for legacy owner 90 / Unit 108, legacy owner 91 / Unit 40 and native Liliana mapping, Unit 175 relationships, the Unit 85 ownership difference, stale/conflicting legacy relationship IDs, and the September 1 Unit 605 transfer provenance.

**CORRECTED FACT**

Hugo Aduvire Pataca (legacy owner 6) currently owns Unit 201, EST-17, and DEPOS-30 in TB810. The earlier “Unit 201 only” conclusion came from an incomplete audit query.

## 4. Authoritative 2026 Budget

**RECONCILED FACT**

The adopted 2026 monthly operating budget is **PEN 20,055.00**. TB810 temporarily contained PEN 22,000.00 as development/setup data entered while building the Budget page. The product owner corrected it through the real Budget UI to PEN 20,055.00. PEN 22,000.00 is not a newer business budget.

## 5. Annual Budget Policy

**CARLOS-CONFIRMED / TB810 DECISION**

Once an annual Budget is adopted, it remains fixed for that financial year. Unexpected in-year expenses do not rewrite it. They use the appropriate native exception mechanism, such as a Unit Charge or Owner Direct Charge. Known recurring costs belong in the next annual Budget.

## 6. September Legacy Benchmark

**LEGACY FACT**

The authoritative September inventory contains 77 maintenance bills for 76 distinct owners:

| Component | Persisted total |
| --- | ---: |
| Total | PEN 24,687.11 |
| Fixed | PEN 21,464.15 |
| Water | PEN 3,042.96 |
| Others | PEN 180.00 |

Known cent-level parent/detail differences are historical evidence and are not repaired in the cutover record.

## 7. Water Parity and Hugo Control Case

**RECONCILED FACT**

September legacy obligations consume the August source cycle:

- August Unit Water: 64 readings, aggregate consumption 686, reading date August 5, 2026.
- August Sedapal: 11,435 -> 12,146, consumption 711, invoice PEN 3,042.00, reading date August 5, 2026.
- Legacy Metered Water: PEN 2,936.08 using the stored rounded unit price PEN 4.28.
- Current TB810 precise-rate Metered Water: PEN 2,935.07.
- Exact Common Water pool: PEN 106.93.
- Rounded per-condo Common Water: PEN 1.67.
- Rounded aggregate Common Water: PEN 106.88.
- Displayed combined Water: PEN 3,041.95, a PEN 0.05 difference from the supplier invoice.
  This approved package predates WATER-012 and keeps its historical Common Water rounding variance: owner allocation PEN 106.88 - source pool PEN 106.93 = -PEN 0.05. The current WATER-012 policy rounds the share up and would not produce a negative variance; the approved package is not recalculated.

The legacy and native values are both explained, but they use different policies. Legacy applies the rounded PEN 4.28 rate per condo; current TB810 applies the precise PEN 3,042 / 711 rate. The difference is PEN 1.01. No residual-cent redistribution is introduced. The October native Water policy remains an explicit open product/financial decision.

Hugo Aduvire Pataca's persisted September components are Unit 201 fixed PEN 391.81, EST-17 PEN 35.50, DEPOS-30 PEN 11.03, Metered Water PEN 4.28, and Common Water PEN 1.67, for a persisted total of PEN 444.29. A legacy UI screenshot showed PEN 444.30 with “Includes Rounding”; the database value PEN 444.29 is the parity target.

## 8. Legacy `bill_adjustment` Findings

**LEGACY FACT / RECONCILED FACT**

Legacy `units.bill_adjustment` is a generic, time-varying fixed-assessment override:

```text
round(monthly budget * participation percentage, 2) + bill_adjustment
```

The current September 28 snapshot contains 66 nonzero adjustments:

- 64 condos: 63 at PEN 22.00 and Unit 904 at PEN 10.00.
- EST-13: PEN 8.40.
- EST-42: PEN 8.00.
- No storage adjustments.
- Total adjustment pool: PEN 1,412.40.

September base participation-derived fixed assessments total PEN 20,051.80. Detail fixed assessments total PEN 21,464.20; the persisted parent fixed total is PEN 21,464.15. The PEN 0.05 difference is retained as legacy evidence.

Current condos at PEN 22.00 are:

`201, 202, 203, 204, 205, 206, 301, 302, 303, 304, 305, 306, 401, 402, 403, 404, 405, 406, 501, 502, 503, 504, 505, 506, 601, 602, 603, 604, 605, 606, 701, 702, 703, 704, 801, 802, 803, 804, 901, 902, 903, 1001, 1002, 1003, 1101, 1102, 1103, 1201, 1202, 1203, 1301, 1302, 1303, 1401, 1402, 1403, 1501, 1502, 1503, 1601, 1602, 1701, 1702`.

## 9. Adjustment Timeline and Corrections

**RECONCILED FACT**

Complete comparable obligation detail is available for November/December 2023 and January-September 2026. Earlier 2023 records are incomplete.

- November 2023 included nonzero adjustments for condos 202, 502, 504, 603, 702, 802, 804, 901, 904, 1003, 1101, 1102, 1203, 1302; parking EST-13, EST-42, EST-1, EST-3, EST-5, EST-60; and storage DEPOS-40.
- December 2023 additionally showed Unit 602.
- Historical values included +5, -40, -20, +9.50, -25, and other amounts, proving that the field had multiple meanings and changed over time.
- January-April 2026: 16 adjusted units, with condo total -PEN 10.60, parking total +PEN 6.60, and storage total -PEN 14.90.
- May-July 2026: 68 adjusted units, with condo total +PEN 1,396.00, parking total +PEN 6.60, and storage total -PEN 14.90.
- August-September 2026: 66 adjusted units, with condo total +PEN 1,396.00, parking total +PEN 16.40, and storage total PEN 0.00.

**CORRECTED FACT: Units 606 and 1701**

Both have current PEN 22.00 values, null comments, and 2023-10-22 creation/update timestamps. Historical detail shows no PEN 22 increment in January-April 2026; both first show PEN 22 in May 2026 and remain at that value through September. Their 2023 timestamps are unit-row timestamps, not proof of a 2023 adjustment. They belong mathematically to the May event.

## 10. Open Legacy Facts

### Unit 904

- Legacy ID 53; condo; participation 1.344%.
- Current PEN 10.00; exact comment: `Ajuste para mantener cuota hasta el 2023. Luego se retirara`.
- Created 2023-10-22 21:01:11; updated 2023-11-30 21:38:43; created/modified by legacy administrator ID 1.
- November 2023 base was PEN 262.48; actual fixed assessment was PEN 272.48; implied adjustment was PEN 10.00.
- The amount remains mathematically observable through September 2026.
- **OPEN AT CUTOVER:** Carlos has not confirmed whether it remains valid. Do not carry it into October automatically.

### EST-13

- Legacy ID 88; parking; participation 0.212%; PEN 8.40.
- Exact comment: `Ajuste para mantener cuota 2023.`
- Created 2023-10-22 21:01:11; updated 2023-11-30 22:33:17.
- First proven in November 2023 and active through September 2026.
- **OPEN AT CUTOVER:** Do not carry it into October automatically.

### EST-42

- Legacy ID 117; parking; participation 0.208%; PEN 8.00.
- Exact comment: `Ajste para mantener cuota hasta el 2023. Luego se retirara`.
- Created 2023-10-22 21:01:11; updated 2023-11-30 21:50:22.
- First proven in November 2023 and active through September 2026.
- **OPEN AT CUTOVER:** Do not carry it into October automatically.

Other open questions are historical ownership/provenance discrepancies and the native semantic mapping of September “Others” PEN 180.00. The full 77/77 September parity result is now closed in [`september-2026-legacy-parity.md`](september-2026-legacy-parity.md).

## 11. Bono empleados

**CARLOS-CONFIRMED BUSINESS FACT**

The May 2026 PEN 22 condo assessment represents `Bono empleados`, an unplanned 2026 employee bonus that was outside the frozen annual budget.

For October, November, and December 2026, Carlos wants a separate **PEN 22.00 charge for every condo**, including Unit 904. There are 64 condos, so the monthly pool is PEN 1,408.00.

Unit 904's new PEN 22 Bono empleados charge must not be treated as a replacement for its historical PEN 10. Until the PEN 10 is confirmed, it must not be carried into October.

**TB810 DECISION / NOT IMPLEMENTED IN THIS RECORD**

Represent Bono empleados as a grouped Unit Charge for October-December 2026 with an explanatory comment such as `Bono empleados`. It is an in-year exception and does not modify the adopted 2026 Budget.

Known recurring costs belong in the 2027 Budget rather than indefinite ad-hoc charges.

## 12. Native Charge Semantics

**TB810 PRODUCT DECISION**

- A Unit Charge belongs to a physical Unit/property and follows the applicable owner.
- An Owner Direct Charge belongs directly to an Owner and does not depend on a Unit.
- Both require explanatory comments, including bulk-created charges.
- Bulk operations must remain identifiable as grouped operations and support coherent review, edit, and removal before approval.
- After approval/snapshot, reviewed financial facts must not be silently mutated.

Legacy `bill_adjustment` is not migrated generically. A surviving fact must be translated by meaning: an unplanned unit expense may be a Unit Charge; a personal owner assessment may be an Owner Direct Charge; a permanent quota correction requires an explicit permanent-financial-term decision rather than an incidental charge.

## 13. Permanent Unit Account

**CANONICAL ARCHITECTURE**

TB810's Permanent Unit Account is the `tb810_unit_accounts` entity, created and maintained by [`20260715190000_permanent_unit_accounts.sql`](../../supabase/migrations/20260715190000_permanent_unit_accounts.sql). The migration ensures one account per `tb810_units` row and creates accounts for all unit types represented by the Unit inventory; no condo-only predicate is used.

The account belongs to the physical Unit, survives ownership changes, and is the parent for invoices, payments, credits, account transactions, documents, and related ledger history. It is not a recurring assessment-adjustment mechanism. Unit Charges are separately unit-linked charge records; they do not become permanent Unit Account terms merely because the affected Unit has an account.

## 14. Native September Source Facts

**PROVEN TB810 SOURCE STATE**

These are September source facts feeding October, not September legacy obligation facts:

- Unit Water: 64/64 readings; aggregate consumption 509.
- Sedapal: 12,146 -> 12,846; consumption 700; invoice PEN 3,100.
- Gas: 58/58 applicable readings; aggregate consumption 346.612.
- Pending Gas supplier bill: `B002-TEST-SEP02`, PEN 460.00.

## 15. Proven October Gas Calculation

**PROVEN**

September Gas consumption 346.612 across 58 applicable units and a PEN 460.00 supplier pool produces internal blended rate `1.3271323554868266`, display rate `1.327132`, and rounded allocations totaling PEN 459.97, with a -PEN 0.03 residual. No residual redistribution is used.

The rule is supplier pool divided by aggregate participating consumption, multiplied by each unit's consumption using full internal precision, then rounded per unit to cents.

## 16. First Ride Objective and Scope

First Ride asks whether Giuliana can complete the real September operation, TB810 can produce a provable October obligation, and the package can be handed to Carlos for approval.

First Ride ends when September source facts are complete, October calculations are proven, handoff is correct, Carlos can review and approve, the immutable October snapshot is created, and consumed Gas supplier bills become processed. Invoice generation and dispatch are outside this milestone.

## 17. Open at Cutover

| Question | Status |
| --- | --- |
| Unit 904 PEN 10 | OPEN; do not carry automatically |
| EST-13 PEN 8.40 | OPEN; do not carry automatically |
| EST-42 PEN 8.00 | OPEN; do not carry automatically |
| Historical ownership/provenance discrepancies | OPEN migration follow-up |
| September Others PEN 180.00 native mapping | OPEN |
| Full September 77-obligation parity | PROVEN / CLOSED; see detailed parity ledger |

## 18. Deliberately Not Migrated

- Generic `bill_adjustment` as a native field
- Unresolved historical quota adjustments
- Historical payments merely to make First Ride work
- Retroactive native September obligation lifecycle
- Legacy presentation rounding quirks as new TB810 rules

## 19. September Parity Checkpoint

The full read-only September 2026 parity audit is complete. All 77 legacy obligations are mathematically explained at owner, applicable-unit, fixed-assessment, Water, Others, and total levels. Gas is excluded from September legacy parity. See the detailed [`September 2026 Legacy Financial Parity`](september-2026-legacy-parity.md) ledger.

## 20. MVP2 Budget Builder Requirement

This is a product requirement, not implemented architecture. A future Budget Builder should let Carlos compose understandable annual allocations, preview projected obligations and per-unit/owner impact, adopt/freeze the annual Budget, preserve it through the year, and represent legitimate in-year exceptions through Unit Charges or Owner Direct Charges. Implementation details such as versioned effective periods or a scenario engine are not frozen by this record.
