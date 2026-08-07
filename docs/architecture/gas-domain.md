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
