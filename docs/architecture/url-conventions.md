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

## Examples

- `/`
- `/water`
- `/water/2026-07`
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

The Monthly Water Ledger object contains workflow sections such as:

- Sedapal Invoice
- Master Meter
- Unit Meter Readings

Those sections are not top-level resources.
