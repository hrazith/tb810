# Gas Domain

Status: Frozen concept document

Date: August 7, 2026

This document freezes the Gas domain architecture before implementation.
It is the canonical architecture reference for Gas facts, Gas calculations, and Gas-enrollment boundaries.

## 1. Purpose

Gas is a future TB810 utility domain.

It owns the gas-side facts and calculations that may eventually contribute to Monthly Obligations and invoices.

This document intentionally does not define implementation details for Gas readings, Gas purchases, or Gas calculations.

## 2. Scope

Gas owns:

- gas-service enrollment meaning
- gas utility facts
- gas-specific calculation outputs

Gas does not own:

- Unit ownership
- Unit identity
- water calculations
- budget calculations
- invoice generation
- payment processing

## 3. Enrollment

`tb810_units.has_gas_service` is the enrollment flag for condominium Units.

It means:

- the Unit participates in the building Gas service
- the Unit has an individual Gas meter

Gas enrollment is optional.

Not every condo has Gas.

Parking and storage cannot have Gas service.

## 4. Open Questions

The gas domain freeze intentionally leaves these implementation questions unresolved until the Gas Sprint:

- the physical meter identity model
- meter replacement history
- meter assignment history
- whether identity belongs on Unit or in a meter table

## 5. Explicit Non-Goals

This document does not:

- implement Gas readings
- implement Gas purchases
- implement Gas calculations
- add the Gas obligation provider
- change schema or production code
- define invoice behavior
- define payment behavior

## 6. Frozen Decisions

- Gas is a future TB810 utility domain.
- `tb810_units.has_gas_service` is the enrollment flag for condo Units.
- Gas enrollment is optional.
- Parking and storage cannot have Gas service.
- The physical Gas meter identity model remains a separate architectural question.

## 7. Production Contract (October 8, 2026)

Status: Implemented in `20261008120000_gas_production_contract.sql`. Sections 1–6 remain the concept freeze; this section is the implemented contract and supersedes any date-based pool rule.

### 7.1 Source month and consuming package

A Gas reading with `reading_month = S` is the reading taken at the start of S and measures consumption for the month before it. Monthly Obligations package `S+1` consumes source month `S`. The rule is the same as for Unit Water and Sedapal.

### 7.2 Gas source freeze

Source month S is editable while package S+1 is absent, `draft`, `collecting_readings`, or `ready_for_review`. It is frozen once S+1 is `approved`, `invoices_generated`, or `closed`.

A row trigger on `tb810_gas_readings` calls the shared `tb810_lock_source_month_open` for the old and new months, in ascending order. This makes the freeze authoritative for every write path:

- inline create, edit, and delete;
- moving a reading between months;
- bulk import;
- Start Over;
- DEV tools.

The trigger takes the package lock shared. Approval and handoff take it exclusively. A source write and an approval of S+1 therefore cannot interleave.

Start Over follows this lifecycle, not the calendar. Any open past source month can be started over; future months cannot.

Only the DEV session reset bypasses the freeze. It does so through a transaction-local setting, and only to remove readings that the DEV session itself created.

Row-level security is enabled on `tb810_gas_readings`:

- staff can read;
- building managers and super admins can write.

### 7.3 Supplier purchases and the explicit pool

A purchase records four things:

- a purchase date;
- a supplier (optional);
- an amount;
- an invoice or reference number (optional).

When the supplier or reference is unknown it is stored as NULL. A placeholder is never invented, and blank strings are rejected.

The purchase date does not determine package membership. Package membership is an explicit selection, and the pool total is the sum of the selected purchases.

How purchases enter the pool:
- **New purchases are included by default.** On creation, through the bills workspace or as a new invoice in a workbook import, a purchase is selected into the open pool: the next package not yet handed off (the Giuliana progression's active package). If that selection fails, the new purchase is removed rather than left silently excluded.
- **Operators can Exclude and Restore.** Exclude clears the selection, so the purchase stays visible in Pending as "Excluded". Restore selects it into the open pool again.
- **The Pending view** shows only unprocessed purchases. Processed purchases appear only under Processed, read-only.
- **Historical groups** that were consumed outside TB810, according to the canonical supplier ledger, are recorded as processed history with a `historical_processing` note. They are not linked to a TB810 Billing Period.

| State | Representation | Who changes it |
| --- | --- | --- |
| available | not selected, not reserved, not processed | — |
| selected | `selected_obligation_month = M` | `tb810_set_gas_bill_selection` (reversible while the M pool is open) |
| reserved | `reserved_billing_period_id = package M` | handoff of M (frozen) |
| processed | `processed_at` set | approval of M |

Rules:

- **Selection is reversible only while the pool is open.** The pool for M is open until M is handed off; from `ready_for_review` onward it is locked. Selection takes the package lock before the purchase row lock, in the same order as handoff.
- **Handoff reserves exactly the selected purchases.** It rejects a requested set that differs from them. Available purchases that were not selected are never swept in.
- **A purchase belongs to at most one package.** It has a single selection and a single reservation.
- **Lifecycle columns move only through the lifecycle.** The selection, reservation and processing columns change only inside the lifecycle functions. A trigger enforces this, because Supabase table grants cannot be narrowed per column. New purchases are always created available.
- **Reserved and processed purchases are read-only.** They cannot be edited or deleted.

### 7.4 Approval-time provenance

Each `gas_consumption` obligation row carries `calculation_snapshot.gasProvenance` with these fields:

```json
{ "sourceMonth": "YYYY-MM", "readingId": "...", "unitConsumption": "...", "billIds": ["..."], "poolTotal": "0.00" }
```

`tb810_persist_monthly_obligation_snapshot` checks this inside the exclusive package lock, after the Sedapal check and before inserting rows. For every Gas row:

- the declared reading must still exist for the source month, with the declared consumption;
- the declared purchase IDs must equal the approved, reserved set;
- the declared pool total must equal the current sum of those purchases.

A missing declaration is rejected as missing provenance. A mismatch is rejected as "Gas source changed after review".

### 7.5 Approved history and the correctable source ledger

Approved obligations are immutable history. The source ledger (readings and purchases) can still be corrected while its consuming package is open. Once that package is finalized, correcting the ledger requires a future explicit, audited repair path. No such path exists yet, and approved obligations are never rewritten implicitly.

### 7.6 No fabricated readings

Non-participation and missing data are different states:

- **Not enrolled:** a Unit without `has_gas_service` does not participate in Gas and has no reading.
- **Missing reading:** an enrolled Unit without a reading for the source month blocks the package.

A missing reading is never filled with an invented `0/0/0` reading. The bulk import requires exactly one reading per enrolled Unit and rejects Units that are not enrolled.

Whether a specific Unit participates is decided through enrollment, not through synthetic readings.
