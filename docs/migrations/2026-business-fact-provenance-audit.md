# 2026 Business Fact Provenance Audit

**Status:** Read-only audit, 2026-09-30

## Scope and sources

This audit covers January through September 2026. The authoritative sources
are `legacy/sql/torrebal_admincondo.sql` (fresh 2026-09-28 production
export), `legacy/data/gas/ConsumoDeGas-25-26-USAR.xlsx`, and the established
Water workbooks/import records. `legacy/sql/localhost.sql` was not used.

The remote comparison was read-only against Supabase project
`fcwnqxpgyqtvckjedgco`. No mutating RPC was invoked.

The comparison uses the business relationship:

```text
source facts in month M -> obligation month M + 1
August source facts -> September obligation
September source facts -> October obligation
```

Classification: `MATCH`, `TRANSFORMED`, `POLICY`, `MISSING`, `EXTRA`,
`SYNTHETIC`, `DISCREPANCY`, or `N/A`.

## Month matrix

| Month | Units | Ownership | Water | Sedapal | Gas readings | Gas bills | Fixed | Adjustments | Final obligation | Overall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jan 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 58 | TRANSFORMED | POLICY | MISSING | N/A | Trusted inputs; no native package |
| Feb 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 56 | TRANSFORMED | POLICY | MISSING | N/A | Gas source gap |
| Mar 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 56 | TRANSFORMED | POLICY | MISSING | N/A | Gas source gap |
| Apr 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 56 | TRANSFORMED | POLICY | MISSING | N/A | Gas source gap |
| May 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 56 | TRANSFORMED | POLICY | MISSING | N/A | Legacy adjustments absent by design |
| Jun 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 56 | TRANSFORMED | POLICY | MISSING | N/A | Gas source gap |
| Jul 2026 | MATCH | TRANSFORMED / OPEN | MATCH / RESTORED FROM AUTHORITATIVE LEGACY | MATCH | TRANSFORMED, 58 | TRANSFORMED | POLICY | MISSING | N/A | Water restored; Gas/ownership open |
| Aug 2026 | MATCH | TRANSFORMED / OPEN | MATCH | MATCH | TRANSFORMED, 56 | MISSING / UNRESOLVED | POLICY | MISSING | N/A | Final real Water cycle; Gas incomplete |
| Sep 2026 | MATCH | TRANSFORMED / OPEN | SYNTHETIC | SYNTHETIC | SYNTHETIC | TEST DATA | POLICY | MISSING | N/A | Rehearsal inputs, not legacy facts |

TB810 currently has 172 Units, 85 normalized owners, 2,368 Water rows
(including the 64-row September fixture), 1,612 Gas readings, 110 Gas bills,
and zero persisted monthly obligations or invoices. The legacy export has 172
Units, 86 owners, 2,304 residential Water rows through August, 35 utility
rows, and 3,558 maintenance bills.

## Real data verified

### Unit and property roster

The roster matches the authoritative export:

- 172 total Units: 64 condos, 60 parking, 48 storage
- no duplicate Unit numbers
- complete legacy IDs and Unit-type mappings
- participation total matches the legacy export
- current canonical Gas eligibility produces 58 condos

The 85 versus 86 owner count is a normalized identity/provenance difference,
not a Unit-roster mismatch.

### Unit Water

The authoritative legacy export contains 64 residential rows in every month
January-August. Current TB810 matches reading end and prior-period consumption
for January-June and August:

| Reading month | Rows | Legacy consumption | TB810 consumption | Result |
| --- | ---: | ---: | ---: | --- |
| Jan 2026 | 64 / 64 | 455 | 455 | MATCH |
| Feb 2026 | 64 / 64 | 555 | 555 | MATCH |
| Mar 2026 | 64 / 64 | 522 | 522 | MATCH |
| Apr 2026 | 64 / 64 | 532 | 532 | MATCH |
| May 2026 | 64 / 64 | 587 | 587 | MATCH |
| Jun 2026 | 64 / 64 | 638 | 638 | MATCH |
| Aug 2026 | 64 / 64 | 686 | 686 | MATCH |

August is the authoritative Water source cycle for the legacy September
obligation.

### July Water contamination

July currently has 64 rows but is not authoritative:

- only Units 201, 202, 203, 204, and 404 retain legacy-backed rows;
- 59 rows carry `legacy_table = tb810_trial_meter_readings` and trial IDs;
- trial metadata says they were scaled from June to create a 430 m3 fixture;
- trial aggregate is approximately 429.997 versus legacy July 709.

This was `CONTAMINATED / SYNTHETIC` and was not valid July history. On
September 30, 2026, the 59 trial rows were removed and replaced with the
authoritative Legacy rows from `legacy/sql/torrebal_admincondo.sql`; the five
already-correct Legacy rows were preserved. The repaired July set is 64/64,
all Legacy-backed, and has aggregate consumption 709, matching Legacy
row-for-row. The completed DEV journal touching preserved Unit 201 is not an
active session ownership path.

### Sedapal / Common Water

Comparing by actual reading/bill date, current TB810 matches legacy January-
August source rows:

| Month | Legacy ID | Reading | Consumption | Amount |
| --- | ---: | --- | ---: | ---: |
| Jan | 31 | 6,611 -> 7,215 | 604 | PEN 2,340.90 |
| Feb | 32 | 7,215 -> 7,911 | 696 | PEN 2,988.50 |
| Mar | 33 | 7,911 -> 8,584 | 673 | PEN 2,870.10 |
| Apr | 34 | 8,584 -> 9,232 | 648 | PEN 2,757.30 |
| May | 35 | 9,232 -> 9,889 | 657 | PEN 2,796.50 |
| Jun | 36 | 9,889 -> 10,588 | 699 | PEN 2,989.60 |
| Jul | 37 | 10,588 -> 11,435 | 847 | PEN 3,657.90 |
| Aug | 38 | 11,435 -> 12,146 | 711 | PEN 3,042.00 |

The current September bill is 12,146 -> 12,846, consumption 700, PEN
3,100.00. Its provenance is `sedapal_live_intake` /
`tb810_common_water_ledger`, with no legacy ID. It is `SYNTHETIC REHEARSAL
DATA`, not a real legacy September bill.

### Fixed assessments

The authoritative 2026 budget is PEN 20,055.00 and the current TB810 2026
Budget Plan is also PEN 20,055.00. TB810's participation-derived base fixed
pool is PEN 20,051.80.

Legacy parent fixed totals are PEN 20,032.85 for January-April, PEN 21,439.45
for May-July, and PEN 21,464.15 for August-September. The differences are
real legacy `units.bill_adjustment` behavior, intentionally not migrated as a
generic native recurring field. This is `REAL / POLICY-DIFFERENT`, not a
budget mismatch.

### Legacy obligation output

The legacy export contains 77 maintenance bills for 76 owners in each month.
The persisted totals are:

| Month | Fixed | Water | Others | Total |
| --- | ---: | ---: | ---: | ---: |
| Jan | PEN 20,032.85 | PEN 2,147.56 | PEN 180.00 | PEN 22,360.41 |
| Feb | PEN 20,032.85 | PEN 2,343.32 | PEN 180.00 | PEN 22,556.17 |
| Mar | PEN 20,032.85 | PEN 2,985.75 | PEN 180.00 | PEN 23,198.60 |
| Apr | PEN 20,032.85 | PEN 2,866.92 | PEN 180.00 | PEN 23,079.77 |
| May | PEN 21,439.45 | PEN 2,760.40 | PEN 180.00 | PEN 24,379.85 |
| Jun | PEN 21,439.45 | PEN 2,798.86 | PEN 180.00 | PEN 24,418.31 |
| Jul | PEN 21,439.45 | PEN 2,991.76 | PEN 180.00 | PEN 24,611.21 |
| Aug | PEN 21,464.15 | PEN 3,658.91 | PEN 180.00 | PEN 25,303.06 |
| Sep | PEN 21,464.15 | PEN 3,042.96 | PEN 180.00 | PEN 24,687.11 |

TB810 has zero persisted historical obligations and invoices by design. The
September 77/77 parity result is documented separately and does not represent
a native persisted September package.

## Gas provenance

The authoritative Gas workbook is `ConsumoDeGas-25-26-USAR.xlsx`, sheet
`Lecturas`. Historical TB810 rows are transformed workbook imports. The
importer explicitly quarantines 12 blank cumulative-reading cells for Units
306 and 804 in February-June and August instead of fabricating values. These
are documented Legacy source gaps, not a TB810 import defect.

| Reading month | TB810 rows | Aggregate consumption | Classification |
| --- | ---: | ---: | --- |
| Jan 2026 | 58 | 120.091 | REAL / TRANSFORMED |
| Feb 2026 | 56 | 135.399 | REAL / TRANSFORMED + missing cells |
| Mar 2026 | 56 | 133.054 | REAL / TRANSFORMED + missing cells |
| Apr 2026 | 56 | 134.601 | REAL / TRANSFORMED + missing cells |
| May 2026 | 56 | 151.671 | REAL / TRANSFORMED + missing cells |
| Jun 2026 | 56 | 166.618 | REAL / TRANSFORMED + missing cells |
| Jul 2026 | 58 | 153.480 | REAL / TRANSFORMED |
| Aug 2026 | 56 | 127.689 | REAL / TRANSFORMED + missing cells |
| Sep 2026 | 58 | 346.612 | SYNTHETIC REHEARSAL |

Historical Gas integrity is **VERIFIED** for the available source facts:

- expected Jan-Aug unit-month positions: 464;
- authoritative populated readings: 452;
- TB810 populated readings: 452;
- authoritative source blanks: 12;
- TB810 synthetic historical readings: 0;
- duplicate unit-month groups: 0; and
- populated value mismatches: 0 after the importer's established three-decimal normalization.

The 12 source blanks are:

- Unit 306, meter `2034050.0`: February, March, April, May, June, and August 2026;
- Unit 804, meter `GA170800161`: February, March, April, May, June, and August 2026.

For continuity, Unit 306 is `240.741` in December 2025, `0` in January 2026,
and `0.0` in July 2026. Unit 804 is `11.524` in December 2025, `0` in
January 2026, and `0.0` in July 2026. The January decreases are not confirmed
meter resets; the available evidence does not establish why the source changed
to zero.

The source gap remains **DOCUMENTED / OPEN FOR FUTURE EVIDENCE**, but it is not
a First Ride blocker. If authoritative evidence is later found, a controlled
historical backfill can be considered. Until then, absence is the correct TB810
representation.

September rows have `legacy_id = null` and empty legacy metadata despite the
legacy-table label. They were entered through the native rehearsal workflow.

The current Gas bill pool is 109 processed workbook-backed historical bills
plus one pending non-workbook bill, `B002-TEST-SEP02`, PEN 460.00. The pending
bill has no legacy provenance and is `TEST DATA`. No real September Gas bill is
present in the authoritative legacy SQL or Gas workbook.

## Legacy adjustments and native charges

Legacy September adjustments total PEN 1,412.40:

- 63 condos at PEN 22.00
- Unit 904 at PEN 10.00
- EST-13 at PEN 8.40
- EST-42 at PEN 8.00

These were intentionally not generically migrated. The current 64 native
`Bono empleados` Unit Charges, totaling PEN 1,408.00 effective October, are a
separate October instruction and must not be compared with September legacy
adjustments.

## Policy differences

Legacy Water uses a rounded building rate per Unit. TB810 uses full precision
and rounds the resulting Unit allocations. For the September legacy benchmark:

- legacy Metered Water: PEN 2,936.08
- TB810 precise-rate Metered Water: PEN 2,935.07
- accepted policy delta: -PEN 1.01

This is `REAL / POLICY-DIFFERENT`, not missing data. Common Water is calculated
from the exact residual and rounded per condo under the accepted convention.

## September deep dive

### Facts that produced the legacy September obligation

The September legacy obligation consumes August source facts:

- August Unit Water: 64 rows, aggregate 686, matched.
- August Sedapal: 11,435 -> 12,146, consumption 711, PEN 3,042.00, matched.
- Gas was excluded from the proven September legacy parity; historical Gas is
  incomplete for August and no real September supplier bill exists.
- September legacy adjustments are real (PEN 1,412.40) but lack an approved
  native semantic mapping.

### Facts collected during September

These are September source facts for October, not September legacy obligation
facts:

- Water: 64/64, aggregate 509, synthetic rehearsal input.
- Sedapal: 12,146 -> 12,846, consumption 700, PEN 3,100.00, synthetic
  rehearsal input.
- Gas: 58/58, aggregate 346.612, synthetic rehearsal input.
- Gas bill: `B002-TEST-SEP02`, PEN 460.00, test data.
- October Bono: 64 x PEN 22.00, native October charges.

## September readiness and action list

For a **synthetic September lifecycle rehearsal**, the accepted September
fixtures may remain, but the run must be labeled synthetic and the pending Gas
bill must remain clearly test data.

For a **real-facts rehearsal**, do not progress until these decisions are made:

1. Do not classify the September Water, Sedapal, or Gas fixtures as legacy
   business facts.
2. Keep the matched August Water/Sedapal set for September parity.
3. Decide how to handle the 12 missing authoritative Gas workbook cells.
4. Obtain or explicitly waive the absence of a real September Gas bill.
5. Decide whether the real September adjustment pool receives native semantic
   mapping; do not generically copy `bill_adjustment`.
6. July Water contamination has been resolved; preserve the audit trail of the
   correction and do not treat the synthetic rehearsal history as Legacy.

## October impact

The current October preview consumes September native source facts. Changing
September Water readings, the September Sedapal bill, September Gas readings,
or the pending Gas bill changes the October preview and readiness state.

July trial rows do not directly supply October while the matched August Water
set remains authoritative, but they invalidate July continuity claims.

## Remediation recommendations

July Water remediation is complete. The remaining historical gates are the 12
missing authoritative Gas cells for Units 306 and 804 and unresolved ownership
provenance cases. September Water, Sedapal, and Gas remain explicitly labeled
synthetic rehearsal inputs.

## Safety

No application code, migration, DEV session, lifecycle, Sedapal, Gas,
supplier-bill, charge, Billing Period, obligation, or invoice data was changed.
The single authorized remote data correction changed only July Unit Water:
59 trial rows were deleted and 59 authoritative Legacy rows were inserted in
one transaction; five existing Legacy rows were untouched. No Pulse, handoff,
approval, snapshot, import, or reset was performed.
