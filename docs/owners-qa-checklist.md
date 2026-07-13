# Owners QA Checklist

## List

- Open `/owners`
- Confirm the list shows owner name, owner reference, email, phone, status, units owned, and last updated date
- Confirm the Add Owner button is visible

## Search

- Search by partial owner name
- Search by email
- Search by phone
- Search by owner reference

## Filter

- Filter active owners
- Filter archived owners
- Filter all owners

## Create

- Open `/owners/new`
- Create an owner with only a required name
- Create an owner with email and phone
- Confirm the new owner receives an owner reference
- Confirm success redirects to the new owner detail page

## Edit

- Open an existing owner
- Use Edit
- Change name, email, phone, and notes
- Confirm the owner reference remains read-only
- Save and confirm the detail page updates

## Archive

- Open an existing owner
- Archive/deactivate the owner
- Confirm the owner remains visible when filtering archived owners

## Validation errors

- Submit without a name
- Submit an invalid email

## RLS / unauthorized

- Sign out
- Try to access `/owners`
- Confirm redirect to `/login`
- Try to access `/owners/new`
- Confirm redirect to `/login`

## Empty state

- Confirm the empty state appears when no owners match the search/filter

## Responsive behavior

- Test list, detail, create, and edit on a narrow mobile viewport
- Confirm actions remain usable without horizontal scrolling
