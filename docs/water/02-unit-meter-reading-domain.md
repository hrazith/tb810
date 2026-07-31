# Unit Meter Reading Domain

Status: Canonical Sprint 1A architecture.

## Purpose

The Unit Meter Reading domain captures per-unit operational water facts.

It is responsible for:

- storing the monthly reading history for each meter-bearing condo unit
- resolving previous readings
- calculating consumption
- preserving provenance for imported history and manual corrections

It is not responsible for:

- Sedapal billing
- monthly water allocation
- obligations
- payments

## Business Concepts

- Building: the single TB810 building context.
- Unit: the canonical residential asset.
- Utility Type: the water subtype attached to readings.
- Reading Month: the calendar month that owns the reading.
- Reading Date: the date the reading was taken.
- Previous Reading: the latest reading from a strictly earlier month.
- Consumption: `reading_end - previous_reading`.

## Canonical Identity

One reading exists per:

- `building_id`
- `unit_id`
- `utility_type_id`
- `reading_month`

`reading_date` is not the identity.

A Unit may have multiple readings across different months.
A Unit may not have two readings for the same utility type in the same calendar month.

### Why `reading_month` is canonical

The business rule is monthly. The reading date is only the day the monthly fact was recorded.

The month is what determines:

- duplicate prevention
- previous-reading lookup
- editability
- routing
- historical grouping

Using `reading_date` alone would allow two July rows if one was entered on July 1 and another on July 15.

## Previous Reading Resolution

Previous reading must come from the latest canonical reading in a strictly earlier calendar month.

It must never come from another row in the same month.

That rule protects the monthly sequence:

- June reading
- July reading
- July consumption derived from June

## Consumption Calculation

Consumption is calculated from the retained prior month reading:

`consumption = reading_end - previous_reading`

When no earlier reading exists, the system shows `—` or a null equivalent rather than inventing a baseline.

## Sequence

```mermaid
flowchart LR
  A[June reading] --> B[July reading]
  B --> C[Consumption = July end - June end]
```

## CRUD Behavior

### Create

- allowed only for the active operational month
- rejects an existing row in the same building/unit/utility/month
- preserves provenance fields

### Update

- allowed only for the active operational month
- excludes the current row id from duplicate checks
- preserves the canonical row id
- recalculates reading start and consumption consistently

### Delete

- allowed only for eligible current-month rows
- removes the canonical row
- is not a soft delete

### Historical Months

- read-only
- Add is hidden
- Delete is hidden
- inline editing is disabled

## Workbook Template Contract

The approved temporary operational workbook is `lecturas.xlsx`.

Worksheet:

- `Worksheet`

Required columns:

- `Unidad`
- `Lectura`

Compatibility aliases accepted only by the parser adapter:

- `Unit` → `Unidad`
- `Reading` → `Lectura`

The parser normalizes `DEP-201` → `201`, preserves unit numbers as strings, and treats blank readings as null during this parsing slice.

The workbook contract does not include Building, Unit ID, month, date, or utility type fields. Those are derived by TB810 from route context and canonical master data.

## Future Correction Workflow

Sprint 1A intentionally does not introduce a historical correction workflow.

If historical corrections are needed later, they should be handled by an explicit correction design rather than by reusing active-month edit rules.

## Implementation References

- [`app/(staff)/water/unit-meter-readings/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/page.tsx)
- [`app/(staff)/water/unit-meter-readings/[month]/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/[month]/page.tsx)
- [`server/water/unit-meter-readings.ts`](/Users/roon/dev/tb810/server/water/unit-meter-readings.ts)
- [`app/(staff)/water/unit-meter-readings/_components/current-meter-reading-row.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/_components/current-meter-reading-row.tsx)
- [`app/(staff)/water/unit-meter-readings/_components/add-meter-reading-row.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/_components/add-meter-reading-row.tsx)
