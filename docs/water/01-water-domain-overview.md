# Water Domain Overview

Status: Canonical documentation for TB810 Water after Sprint 1A.

This document defines the Water bounded context as two intentionally separate workflows:

- Unit Water Meter Readings
- Monthly Water Ledger

They share a business domain, but they do not share the same responsibility.

## Purpose

TB810 Water exists to move from operational water facts to financial obligations.

The domain has two distinct phases:

1. Capture facts about what the units actually consumed.
2. Convert those facts into the monthly building water ledger and downstream charges.

Keeping those phases separate prevents operational measurement from becoming a financial posting surface too early.

## Two Workflows

### A. Unit Water Meter Readings

Purpose:

- capture operational water usage
- preserve previous readings and consumption
- maintain an immutable operational history by month

Contains:

- unit readings
- previous readings
- consumption
- monthly operational history

This workspace captures facts.
It does **not** create money.

### B. Monthly Water Ledger

Purpose:

- process monthly building water costs
- capture the Sedapal invoice and master meter
- derive common consumption and allocations
- prepare financial processing

Contains:

- Sedapal invoice
- master meter
- common consumption
- allocations
- financial processing inputs

This workspace converts operational facts into financial obligations.

## Why the Workflows Stay Separate

The operational ledger answers:

- what was read
- when it was read
- how much the unit consumed

The monthly ledger answers:

- what the building was billed
- how the common water cost is allocated
- what downstream obligations should be generated

Those are related, but they are not the same business object.

Combining them would blur auditability, make corrections harder, and risk turning the raw reading history into a mutable billing surface.

## Canonical References

- [`docs/domain-models/water.md`](/Users/roon/dev/tb810/docs/domain-models/water.md)
- [`docs/tb810-water-domain.md`](/Users/roon/dev/tb810/docs/tb810-water-domain.md)
- [`docs/architecture/architecture-decision-register.md`](/Users/roon/dev/tb810/docs/architecture/architecture-decision-register.md)

## Implementation References

- [`app/(staff)/water/unit-meter-readings/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/page.tsx)
- [`app/(staff)/water/unit-meter-readings/[month]/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/unit-meter-readings/[month]/page.tsx)
- [`app/(staff)/water/[period]/page.tsx`](/Users/roon/dev/tb810/app/(staff)/water/[period]/page.tsx)
- [`server/water/unit-meter-readings.ts`](/Users/roon/dev/tb810/server/water/unit-meter-readings.ts)
- [`server/water/month.ts`](/Users/roon/dev/tb810/server/water/month.ts)

