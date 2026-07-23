# Torre Balta 810 RLS and Permissions

## Access Model

TB810 is staff-only for now.

- No owner portal yet
- No public self-service portal yet
- No anonymous accounting access
- All access is scoped to authenticated staff users and their assigned roles

The app should eventually support read-only reporting for some roles, but all financial writes should stay staff-controlled.

## Roles

### Super Admin

Carlos Avila is the Super Admin and final accounting authority.

Can:

- Approve bills
- Approve billing periods
- Reverse payments
- Transfer credits
- Configure late fees
- Manage staff
- Make accounting overrides
- Approve exceptions
- Reverse payment allocations later

### Building Manager

Guliana is the Building Manager.

Can:

- Enter utility bills
- Enter water readings
- Review billing data
- View financials
- Mark billing periods ready for review

Cannot:

- Approve bills
- Approve billing periods
- Reverse payments
- Transfer credits
- Override accounting decisions
- Configure late fees

### Reconciliation Specialist

Junior is the reconciliation specialist.

Can:

- Enter vouchers and payment evidence
- Reconcile payments
- View required balances
- Review both invoices and unit accounts

Cannot:

- Reverse payments
- Approve exceptions
- Transfer credits
- Override accounting decisions without Super Admin approval

Receipt note:

- receipt generation is available only after a payment is fully reconciled
- receipts are read-only after creation
- duplicate generation is blocked because each payment can have only one receipt

### Building Staff

Building staff are limited intake users.

Can:

- Submit documents and evidence
- Upload photos
- Forward supporting material

Cannot:

- View broad financial data
- Approve bills
- Reverse payments
- Reconcile payments
- Transfer credits

### Viewer

Read-only reporting role.

Can:

- Read reports
- Read approved records
- Read documents that staff have already approved for visibility

Cannot:

- Write anything
- Approve anything
- Reverse anything

## Table Access Guidance

### Public read should not exist

No TB810 accounting table should be readable by the public or anonymous users.

### Read-only for viewer

Viewer should be read-only on:

- `tb810_buildings`
- `tb810_units`
- `tb810_owners`
- `tb810_ownerships`
- `tb810_unit_accounts`
- `tb810_billing_periods`
- `tb810_invoices`
- `tb810_invoice_line_items`
- `tb810_payments`
- `tb810_receipts`
- `tb810_payment_allocations`
- `tb810_account_transactions`
- `tb810_credits`
- `tb810_credit_transfers`
- `tb810_utility_types`
- `tb810_utility_bills`
- `tb810_meter_readings`
- `tb810_suppliers`
- `tb810_expenses`
- `tb810_documents`
- `tb810_communications`
- `tb810_audit_logs`

### Restricted writes

Suggested write rules:

- `tb810_buildings`, `tb810_units`, `tb810_ownerships`, `tb810_unit_accounts`
  - building_manager and super_admin
- `tb810_billing_periods`, `tb810_invoices`, `tb810_invoice_line_items`
  - building_manager can draft and update
  - super_admin can approve/finalize
- `tb810_payments`, `tb810_payment_allocations`, `tb810_account_transactions`
  - reconciliation_specialist can create and update reconciliation drafts
  - super_admin can reverse and override
- `tb810_receipts`
  - super_admin can generate the initial receipt
  - everyone else can read only
- `tb810_credits`, `tb810_credit_transfers`
  - only super_admin can approve or post transfers
- `tb810_utility_bills`, `tb810_meter_readings`
  - building_manager and super_admin
- `tb810_expenses`, `tb810_suppliers`
  - building_manager and super_admin
- `tb810_documents`
  - building_staff can upload
  - reconciliation_specialist can attach evidence
  - building_manager and super_admin can review/approve
- `tb810_staff_profiles`, `tb810_roles`, `tb810_permissions`, `tb810_role_permissions`, `tb810_staff_roles`
  - super_admin only
- `tb810_audit_logs`
  - insert via app/service flows only
  - read by authorized staff

## Suggested RLS Policies

These are the policy shapes the app should implement.

### Staff membership gate

All selects and writes should require authenticated staff membership.

Suggested pattern:

- `public.is_tb810_staff()`
- profile lookup in `tb810_staff_profiles`
- role lookup through `tb810_staff_roles`

Helper functions expected by the schema:

- `is_tb810_staff()`
- `has_tb810_role(role_key text)`
- `has_tb810_permission(permission_key text)`

### Approval boundaries

Rows with approval state should have separate policy checks:

- only super_admin can approve bills
- only super_admin can approve billing periods
- only super_admin can reverse payments
- only super_admin can post credit transfers
- only super_admin can configure late fees

### Service role note

Service-role access bypasses RLS and should be reserved for trusted server-side jobs such as migrations, seeds, and controlled maintenance scripts.

Application code should not assume service-role behavior for normal staff sessions.

### Draft versus final records

Suggested split:

- building_manager and reconciliation_specialist may create draft or review records
- only super_admin may finalize or reverse sensitive accounting records

## Insert / Update / Delete Expectations

### Super Admin

- Can insert, update, and delete across accounting tables where business rules allow
- Must be the only role able to reverse payments and transfer credits

### Building Manager

- Can insert and update utility and billing draft records
- Should not delete posted accounting records
- Should not reverse payments or transfer credits

### Reconciliation Specialist

- Can insert payment and allocation drafts
- Should not delete posted accounting records
- Should not reverse payments
- Should not approve exceptions

## Reversal Model

Reversal work is intentionally deferred, but the expected pattern is:

- only Super Admin can reverse a payment allocation
- reversal should create a compensating `tb810_account_transactions` row rather than deleting history
- invoice `amount_paid`, `balance_due`, and status should be recomputed from the ledger
- a reversal should be blocked if it would make allocated totals inconsistent without an explicit override
- every reversal should write an audit log row with the reason and actor

### Audit inserts

Any sensitive write should emit an audit log entry.

Recommended audit-trigger subjects:

- invoice approval
- payment reversal
- credit transfer approval
- late fee configuration
- manual balance adjustment
- staff role change

## Super Admin Only Actions

Super Admin must be required for:

- reversing payments
- approving exceptions
- transferring credits across unit accounts
- manual accounting overrides
- final bill approval
- late fee configuration
- receipt reissue or void if that workflow is added later
- staff management

## Credit Transfer Rule

Credit transfers across unit accounts are allowed only by Super Admin.

Each transfer must:

- specify a reason
- write an audit log entry
- create source and destination account transactions
- ensure the source and destination unit account are not the same

Credits must stay scoped to a unit account unless explicitly transferred.

They should not be automatically pooled across all units owned by the same owner.

## Metering Note

Parking and storage units do not have meter readings.

This is enforced with a database trigger in the migration. If the trigger ever becomes impractical, the application must keep an explicit guard before write submission.

## Reporting Visibility

Delinquency reports must support both:

- owner-level views
- unit-level views

That means read access to reporting data should not collapse unit-account detail into owner-only summaries.

