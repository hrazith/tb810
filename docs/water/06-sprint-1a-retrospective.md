# Sprint 1A Retrospective

Status: Completed architecture review and implementation retrospective.

## Initial Assumptions

At the start of Sprint 1A, the meter-reading workflow was expected to be a straightforward CRUD surface for current-month readings.

That assumption proved too weak once real historical data and manual corrections were introduced.

## Problems Discovered

- duplicate-looking UI rows
- hidden server errors in the Add row
- month validation that only compared the exact date
- multiple readings allowed for the same unit in the same month
- legacy import provenance was not yet formalized
- the historical route structure was split across more than one water surface

## What Was Learned

### 1. Operational facts and financial postings must remain separate

Unit readings are facts.
Monthly water ledgers are financial processing.

### 2. Month is the true identity

The business rule is monthly, not daily.

### 3. Application checks are not enough

The database must enforce the invariant too.

### 4. Historical data needs provenance

Imported rows must remain traceable to the source system.

### 5. URL state matters

Month selection needs to live in the route so the page is reloadable and shareable.

## Why the Architecture Is Stronger Today

The sprint established:

- canonical monthly reading identity
- generated month column
- unique database invariant
- active vs historical editability rules
- path-based month routing
- explicit historical import provenance
- separation between operational ledger and monthly financial ledger

Those decisions make the Water domain safer to extend into obligations and billing.

## Implementation References

- [`docs/water/01-water-domain-overview.md`](/Users/roon/dev/tb810/docs/water/01-water-domain-overview.md)
- [`docs/water/02-unit-meter-reading-domain.md`](/Users/roon/dev/tb810/docs/water/02-unit-meter-reading-domain.md)
- [`docs/water/03-june-2026-import.md`](/Users/roon/dev/tb810/docs/water/03-june-2026-import.md)
- [`docs/water/04-month-routing.md`](/Users/roon/dev/tb810/docs/water/04-month-routing.md)
- [`docs/water/05-meter-reading-database.md`](/Users/roon/dev/tb810/docs/water/05-meter-reading-database.md)

