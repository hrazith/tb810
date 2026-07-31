# Meter Reading Database

Status: Canonical persistence model for Sprint 1A.

## Tables

The primary table is:

- `tb810_meter_readings`

This table stores the operational meter-reading facts for unit water readings.

## Generated Column

Sprint 1A introduced a stored generated month column:

- `reading_month`

It is derived from `reading_date` and stores the first day of the month.

## Unique Enforcement

The database now enforces uniqueness across:

- `building_id`
- `unit_id`
- `utility_type_id`
- `reading_month`

This is the canonical monthly identity.

## Migration Notes

The first migration attempt used `date_trunc('month', reading_date)`, but PostgreSQL rejected that expression for a stored generated column because it was not immutable enough for this use.

The final implementation uses:

- `make_date(extract(year from reading_date)::int, extract(month from reading_date)::int, 1)`

That expression is immutable for the purposes of the generated column and consistently produces the first day of the month.

## Why the Rule Exists in Both App and Database

Application validation protects the user experience:

- early duplicate detection
- clearer error messages
- safer form feedback

Database constraints protect the invariant:

- no duplicate month rows even if application code is bypassed
- no accidental future regressions

Both are required.

## Implementation References

- [`supabase/migrations/20260731120000_meter_readings_month_identity.sql`](/Users/roon/dev/tb810/supabase/migrations/20260731120000_meter_readings_month_identity.sql)
- [`server/water/unit-meter-readings.ts`](/Users/roon/dev/tb810/server/water/unit-meter-readings.ts)

