# Water Domain

The authoritative finance architecture is frozen in [`docs/architecture/finance-architecture-freeze-v1.md`](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md). This document captures the Water domain architecture that emerged from the current design sprint.

## Purpose

Water is a separate financial input and calculation domain.

It turns authoritative source facts into explainable per-Unit water charges that can later be snapshotted into Monthly Financial Obligations.

Water does not belong to:

- Unit ownership
- the Unit record
- payments
- Monthly Financial Obligations

## Core Objects

### Water Meter

Represents the physical meter device.

- belongs to a metered Unit
- exists independently from readings
- should support installation and retirement/replacement history
- exact metadata and replacement workflow remain pending confirmation from Carlos

### Meter Reading

A historical observation associated with a Water Meter.

- contains the cumulative reading value
- contains the reading date
- contains the applicable consumption period
- may include a source photo or attachment
- includes audit information
- the human enters or verifies the cumulative reading
- consumption is not manually entered

### Supplier Utility Bill

Represents the Sedapal building-level invoice.

- remains separate from Unit-level water allocations
- stores authoritative supplier facts
- may include billing period, invoice amount, provider consumption, supplied meter readings, and attachments

### Water Allocation

Represents the system’s calculation for a building and billing period.

- combines supplier bill facts
- combines Unit consumption
- uses the water unit rate
- uses common water consumption
- uses participation percentages where appropriate
- produces explainable per-Unit water results

### Calculated Unit Water Charge

The per-Unit output of the Water Allocation.

- remains live and recalculable until the applicable accounting period closes
- is not itself the final historical accounting record

## Legacy Implementation Findings

The legacy TB810 database did not model a standalone meter-device entity. Instead it stored monthly reading history in a `meters` table.

The legacy water-related tables were:

- `meters`
- `utilities`
- `utility_types`
- `maintenance_bills`
- `detail_bills`
- `payments`
- `detail_payments`
- `detail_payment_maintenance_bill`
- `media`

The legacy model also used:

- `units.unit_percentage` for participation
- `units.has_meter` for meter capability
- `units.bill_adjustment` for historical adjustment behavior

## Legacy Water Workflow

The legacy workflow was staff-operated:

1. Giuliana collects or receives photographs of individual condo water meters.
2. Giuliana records each current cumulative meter reading.
3. Giuliana records the Sedapal supplier invoice facts.
4. The system calculates consumption and water allocation.
5. Carlos does not approve water calculations.
6. Carlos’s approval responsibility applies to expenses, which is a separate future domain.

## Deterministic Calculations

Water calculations are explainable and deterministic.

### Unit Consumption

`Current Accepted Reading - Previous Accepted Reading = Unit Consumption`

### Water Unit Rate

`Supplier Invoice Amount ÷ Supplier Total Consumption = Water Unit Rate`

### Common Consumption

`Supplier Total Consumption - Sum of all Unit Consumption = Common Consumption`

### Private Water Charge

`Unit Consumption × Water Unit Rate = Private Water Charge`

### Building Common Water Amount

`Common Consumption × Water Unit Rate = Building Common Water Amount`

### Unit Common Water Allocation

`Building Common Water Amount × Unit Participation Percentage = Unit Common Water Allocation`

### Total Unit Water Charge

`Private Water Charge + Unit Common Water Allocation = Total Unit Water Charge`

## Business Rules

- Water is not approval-driven in MVP1.
- Water is event-driven: facts arrive, calculations update, accounting snapshots close the period.
- Closed historical obligations must not be silently edited or recalculated.
- Corrections must be represented through explicit adjustment records or prior-period adjustments.
- Missing readings remain an open business decision requiring Carlos confirmation.
- Condos may have water meters.
- Parking and storage do not have water meters.
- Parking and storage may still participate in other percentage-based or one-off charges depending on the governing rule.
- The system should not assume that every Unit receives a private water charge.

## Historical Integrity

The Fixed Monthly Assessment is a derived planning value.

Historical monthly charges are represented by Monthly Financial Obligations, which snapshot the Fixed Monthly Assessment at the time obligations are generated.

For Water, the same principle applies:

- live calculated values may change while the period is open
- finalized accounting snapshots must remain historically explainable
- corrections must preserve the original issued amount

## Open Questions

- exact meter replacement procedure
- exact required meter metadata
- exact missing-reading policy
- exact scheduler and timezone model for closing periods
- exact correction placement rules when multiple historical months are affected

## Future Boundaries

The Water domain should not absorb:

- ownership history
- payment settlement
- general accounting balances
- expense approval logic
- budget planning

Those belong to their own domains.

