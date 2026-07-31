# Month Routing

Status: Canonical routing model for the Unit Water Meter Readings workflow.

## Canonical Route

The canonical route for the unit meter-reading month view is:

- `/water/unit-meter-readings/YYYY-MM`

Examples:

- `/water/unit-meter-readings/2026-07`
- `/water/unit-meter-readings/2026-06`
- `/water/unit-meter-readings/2026-05`

Individual meter-reading detail routes are nested under the month:

- `/water/unit-meter-readings/YYYY-MM/reading/[readingId]`
- `/water/unit-meter-readings/YYYY-MM/reading/[readingId]/edit`

## Base Redirect

The base route:

- `/water/unit-meter-readings`

redirects to the active operational month.

## Compatibility Redirect

The old query-string form:

- `/water/unit-meter-readings?month=2026-06`

redirects to:

- `/water/unit-meter-readings/2026-06`

This preserves bookmarks while moving the app to a single canonical path structure.

The old sibling detail route `/water/unit-meter-readings/[readingId]` was removed because it collided with the canonical month route.

## Historical Routes

The older water-ledger route family still exists separately:

- `/water/[period]`

It is preserved because it serves the Monthly Water Ledger, not the unit meter-reading ledger.

It is not the same workflow and should not be collapsed into the Unit Meter Readings URL space.

## Why Query Parameters Were Replaced

Query parameters made the page state too easy to split:

- URL state
- server data
- month selector state

The path-based month route makes the selected month explicit, shareable, and reloadable.

## Routing Conventions for Future Ledgers

Future monthly ledgers should follow the same pattern:

- domain collection route
- canonical month/object route
- redirect from base route to active month
- compatibility redirects only when needed for transition

## Implementation References

- [`app/(staff)/water/unit-meter-readings/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/page.tsx)
- [`app/(staff)/water/unit-meter-readings/[month]/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/[month]/page.tsx)
- [`app/(staff)/water/unit-meter-readings/[month]/reading/[readingId]/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/[month]/reading/[readingId]/page.tsx)
- [`app/(staff)/water/unit-meter-readings/_components/month-ledger-selector.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/_components/month-ledger-selector.tsx)
- [`app/(staff)/water/[period]/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/[period]/page.tsx)
