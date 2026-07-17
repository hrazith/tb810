# Ownerships QA Checklist

## Coverage

- Unit with no Owner
- first Owner assignment
- Unit with current Owner
- Unit with scheduled Ownership
- transfer to a different Owner
- same-Owner rejection
- past billing-month rejection
- overlapping-history rejection
- old Ownership receives correct end date
- new Ownership starts on first day of selected billing month
- Unit Account ID remains unchanged
- Unit Account balance remains unchanged
- incoming Owner inherits outstanding Unit Account debt
- historical invoices remain untouched
- Unit detail shows current and scheduled Ownership plus history
- Owner detail shows current, scheduled, and past Units
- inactive Owner cannot receive transfer
- unauthorized user cannot transfer
- refresh persistence
- responsive behavior

## Notes

- Confirm assignment and transfer use the same workflow shell
- Confirm the transfer action requires the appropriate ownership-management permission
- Confirm the empty state still allows the first assignment
- Confirm the month control is `Billing-effective month`
- Confirm scheduled Ownership does not appear as Current before its month begins
- Confirm no prorating language appears in the transfer summary
