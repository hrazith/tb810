# URL Conventions

This document defines the canonical URL philosophy for TB810.

## Core Rules

- The authenticated root `/` is the user's operational home.
- URLs identify business domains.
- URLs identify business objects.
- Workflow steps are views of a business object.
- Workflow steps should not become independent top-level resources.
- Navigation follows business context rather than technical modules.

## Canonical Pattern

`/`

`/{domain}`

`/{domain}/{object}`
`/{domain}/{collection}/{subresource}`

## Examples

- `/`
- `/water` (redirects to `/water/unit-meter-readings`)
- `/water/sedapal`
- `/water/unit-meter-readings/2026-07`
- `/water/unit-meter-readings/2026-07/reading/953c19da-fecd-49f0-bbf3-f48058100ecd`
- `/gas`
- `/maintenance`
- `/owners`
- `/units`
- `/vendors`
- `/payroll`

## Water Example

Water has no separate Monthly Water Ledger object (WATER-011, which supersedes UX-004). Its canonical source surfaces are:

- `/water/sedapal` is the Sedapal ledger (the building source bill).
- `/water/sedapal/{utilityBillId}` is the Sedapal bill detail route.
- `/water/unit-meter-readings` is the Unit Water Meter Readings entry; it opens the active month.
- `/water/unit-meter-readings/{month}` is the canonical Unit Water Meter Readings month route.
- `/water/unit-meter-readings/{month}/reading/{readingId}` is the canonical unit-reading detail route.

Compatibility redirects:

- `/water` redirects to `/water/unit-meter-readings`.
- `/water/{YYYY-MM}` redirects to `/water/unit-meter-readings/{YYYY-MM}`; any other period is not found.

For the Unit Water Meter Readings workflow, the month is part of the canonical route rather than a query parameter.

Historical note: until 2026-10-06, `/water` was a Water domain home and `/water/{period}` a Monthly Water Ledger object with Sedapal Invoice, Master Meter and Unit Meter Readings sections. Those responsibilities now belong to Sedapal, Unit Meter Readings and Monthly Obligations, and the ledger's noncanonical writes were removed.
