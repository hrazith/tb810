# Ownership Transfer Workflow

## Purpose

Ownership transfer is the controlled workflow that ends one historical Ownership record and creates the next one without disturbing the Unit Account.

It exists because ownership changes affect billing responsibility, but they do not move debt or reset financial history.

## Inputs

- Unit
- current Owner
- incoming Owner
- legal transfer date
- billing responsibility effective period
- notes
- NOC or clearance status, if available
- supporting documents later

## Preconditions

Before a transfer can complete:

- the Unit must exist
- the incoming Owner must exist or be created first
- there must be no overlapping active Ownership for the Unit
- the billing-effective period must be known
- the Unit Account must remain unchanged
- NOC may be required by policy, but enforcement details are deferred

## Workflow

Recommended sequence:

1. Select Unit.
2. Review current Owner.
3. Review Unit Account balance and NOC status.
4. Select or create incoming Owner.
5. Choose legal transfer date.
6. Determine billing-cycle effective date.
7. Close the current Ownership.
8. Create the new Ownership.
9. Preserve the same Unit Account.
10. Confirm which future Billing Period will use the new Owner.
11. Record audit metadata.

## Transactionality

Closing the old Ownership and creating the new Ownership must happen atomically.

The system must never leave:

- two active Owners
- no active Owner unintentionally
- a new Ownership without closing the prior one
- a Unit Account reset

## Billing-Period Interaction

TB810 should resolve responsibility from the Ownership active on the billing-cycle boundary.

Recommended rule:

- use the Owner active on the first day of the Billing Period
- if a transfer closes during July, August becomes the first period billed to the incoming Owner
- the July invoice remains with the outgoing Owner if the July period had already begun

This is the simplest model that fully expresses the confirmed business rule.

## Empty-State Assignment

If a Unit has no current Owner, the same workflow is used to assign the first Owner.

In that case:

- there is no prior Ownership to close
- the new Ownership begins on the chosen first-of-month effective date
- the Unit Account remains unchanged

## Owner Reporting

Owner-level balances are derived by aggregating invoices and Unit Account balances for Units currently assigned to that Owner.

Debt does not move onto the Owner as a personal balance. It remains on the Unit Account.

Example:

- José owns three Units
- José receives three invoices
- reporting shows each invoice and a total

## Current Schema Notes

The current ownership schema can support the workflow shape, but the legacy sync trigger and legacy backfill assumptions should not define the future workflow.

The transfer workflow should eventually be driven by explicit ownership lifecycle logic, not by implicit account creation or closure side effects.
