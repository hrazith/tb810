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
- `/water`
- `/water/2026-07`
- `/water/unit-meter-readings/2026-07`
- `/water/unit-meter-readings/2026-07/reading/953c19da-fecd-49f0-bbf3-f48058100ecd`
- `/gas`
- `/maintenance`
- `/owners`
- `/units`
- `/vendors`
- `/payroll`

## Water Example

- `/water` is the Water domain entry point.
- `/water/{period}` is the Monthly Water Ledger business object.
- `/water/2026-07` and `/water/2026-08` are valid object URLs.
- `/water/unit-meter-readings/{month}` is the canonical Unit Water Meter Readings month route.
- `/water/unit-meter-readings/{month}/reading/{readingId}` is the canonical unit-reading detail route.

The Monthly Water Ledger object contains workflow sections such as:

- Sedapal Invoice
- Master Meter
- Unit Meter Readings

Those sections are not top-level resources.

For the Unit Water Meter Readings workflow, the month is part of the canonical route rather than a query parameter.
