# Ownerships QA Checklist

## Coverage

- Unit with no Owner
- first Owner assignment
- Unit with current Owner
- transfer to a different Owner
- same-Owner rejection
- mid-month effective-date rejection
- overlapping-history rejection
- old Ownership receives correct end date
- new Ownership starts on first of month
- Unit Account ID remains unchanged
- Unit Account balance remains unchanged
- historical invoices remain untouched
- Unit detail shows current Owner and history
- Owner detail shows current and past Units
- inactive Owner cannot receive transfer
- unauthorized user cannot transfer
- refresh persistence
- responsive behavior

## Notes

- Confirm assignment and transfer use the same workflow shell
- Confirm the transfer action requires the appropriate ownership-management permission
- Confirm the empty state still allows the first assignment

