# Dual-Clock Monthly Operating Model

Status: Frozen (FIN-008)

Date: October 9, 2026

This document is the canonical home of TB810's monthly operating model. Other
documents summarize it and link here. It refines FIN-006 (coordinated lifecycle
clocks) without replacing it.

## Canonical invariant

> **Source-domain progression follows the passage of time. Obligation
> progression follows lifecycle completion and Pulse rules. An obligation
> package may lag behind the operational month without preventing source-domain
> work for the current month. Pulse reconciles these two clocks.**

This is a foundational TB810 operating principle.

## 1. The two clocks

### Operational / source clock

The operational/source clock follows calendar time. When the calendar turns
into a new month, that month becomes operationally relevant: October 1 makes
October a valid operational/source month.

Source domains must be able to do legitimate work for the operational month
even when an earlier obligation package is unfinished. This includes Sedapal
bills, Unit Water readings, Gas readings and supplier purchases, Unit Charges,
and any other fact whose provenance belongs to the operational month.

Source work for the operational month is never blocked merely because an older
obligation package has not been handed off or approved.

### Obligation lifecycle clock

The obligation lifecycle does not advance because the calendar changed. It
advances through readiness, calendar eligibility, Pulse, handoff, Carlos's
review and approval, and the oldest-first approval order.

An unfinished obligation package stays relevant after the calendar moves on. If
November 1 arrives before October is handed off, October remains the active
obligation package. TB810 does not abandon it and does not treat November as
the active package.

## 2. Pulse connects the clocks

```text
Calendar turns
    ↓
New operational month becomes relevant
    ↓
Pulse observes the business date
    ↓
Pulse evaluates the operational month
    ↓
Pulse separately evaluates obligation progression
```

**The calendar determines relevance. Pulse governs progression.** "The calendar
creates a month" does not require an external or manual actor: TB810's business
rhythm is owned by Pulse, the system actor that observes the passage of time.

## 3. The clocks may diverge

Divergence is intentional and valid. Each of these is a normal TB810 state:

| Calendar month | Source work | Obligation lifecycle |
| --- | --- | --- |
| November | November source work active | October waiting for its final source fact; September approved |
| November | November source work active | October `ready_for_review` with Carlos |

Giuliana continues November source work in both. The obligation lifecycle
catches up by its own rules.

The active obligation package is the oldest obligation month that has not
crossed the handoff boundary. Progression anchors there, bounded by the
calendar, rather than starting at the calendar month (see §7). Calendar
eligibility still applies: a package is never handed off before its obligation
month begins.

## 4. Roles

**Giuliana** works mainly on the operational/source clock:

```text
Fact arrives → enter it in its domain → leave the domain
```

She does not decide when obligation packages advance, hand off, calculate or
finalize obligations, or create months.

**Pulse** owns the monthly rhythm. It observes the business date, recognizes the
operational month, evaluates the active obligation package and its readiness,
enforces calendar eligibility, and performs the system handoff when eligible.
Pulse never manufactures missing business facts.

**Carlos** works mainly on the obligation lifecycle after handoff:

```text
Pulse hands the package off → Carlos reviews the live package → Carlos approves
```

Approval is separate from Pulse.

## 5. Month vocabulary

Avoid "current month" when the meaning is ambiguous. Use these terms:

| Term | Meaning | Sedapal example (obligation December 2026) |
| --- | --- | --- |
| Calendar month | The month of the business date | — |
| Operational / source month | The calendar month whose source work is now relevant; the month a source fact belongs to | November 2026 |
| Consumption / service month | When the water was consumed; TB810 docs call it Service Month, legacy `utilities.billed_month` and informal filenames use it | October 2026 (about Oct 5 – Nov 5) |
| Sedapal printed billed month | Sedapal's "Mes facturado", the emission month | Noviembre 2026 |
| Unit reading month | `tb810_meter_readings.reading_month`, the month of the reading date (about the 5th) | November 2026 |
| Obligation month | The month in which Units are charged | December 2026 |
| Billing Period | A `tb810_billing_periods` row for one building, year and month; overloaded (see §6) | — |
| Active obligation package | The oldest obligation month not yet handed off | December, if November has been handed off |

Sedapal provenance, counted from consumption:

```text
Consumption month M → Sedapal / reading source month M+1 → Obligation month M+2
```

Counted from Sedapal's printed month: `Mes facturado M → Obligation month M+1`.

Example: water consumed about Oct 5 – Nov 5; Sedapal emits "Noviembre" about
Nov 5; Unit readings belong to the November source month; December obligations
consume the November Water source facts.

Sedapal illustrates the model; it is not a special case. Giuliana enters the
Sedapal bill when it arrives and leaves the Water domain. The future obligation
package looks backward for the source facts it needs; if they are absent when
the package becomes relevant, the package is domain-blocked. Source intake does
not conceptually depend on obligation handoff.

## 6. The Billing Period is overloaded

In the current implementation, one `tb810_billing_periods` row for month X plays
two roles:

1. **Obligation package X.** Its `status` (`ready_for_review`, `approved`, and so
   on) is package X's lifecycle.
2. **The operational-month container for month X.** Some source facts belong to
   it. For example, the Sedapal bill emitted in month X is stored on Billing
   Period X, and package X+1 consumes it.

The dual use is not wrong in itself. The finance architecture defines a Billing
Period as an operational month that exists because time passes
([Finance Architecture Freeze v1](./finance-architecture-freeze-v1.md),
[Billing Periods](../domain-models/billing-periods.md)).

The drift is narrower: the implementation can make the operational-month
container exist only once obligation handoff happens. Since the historical
backfill (2023-09 through 2026-08), Billing Period rows are created only by
obligation handoff or approval. When a handoff is late, the container for an
operational month that is already relevant does not exist yet.

## 7. Two failure modes of one model

**Obligation side (DRIFT-02).** The calendar can move past an unfinished
package. Progression must anchor on the oldest package not yet handed off:

```text
Calendar → November; October unfinished
Active obligation package → October, not November
```

The progression-anchor correction implements this: the anchor is the earlier of
the calendar month and the month after the latest handed-off period, with the
calendar month as the fallback when nothing has been handed off. Pulse still
enforces calendar eligibility.

**Source side (DRIFT-06).** The calendar must make the operational month usable
even when obligation progression lags:

```text
October is operationally current
    ↓
The Sedapal bill emitted in October legitimately arrives
    ↓
October source work should be valid
BUT the October Billing Period row does not exist yet,
because the October obligation handoff is late
    ↓
Sedapal intake is blocked (violation)
```

In normal rhythm, package X is handed off on the first pulse of month X, before
X's Sedapal bill arrives (about the 5th), so the mismatch is invisible. It
appears only when a handoff runs late.

## 8. Implementation conformance

This section records the implementation state against the model.

- **DRIFT-02, progression anchor: implemented in the repository, not yet live.**
  `20261009130000_progression_unfinished_package_anchor.sql` anchors
  progression on the oldest package not handed off. Until it is applied, live
  progression starts at the calendar month.
- **DRIFT-06, operational-month container: implemented in the repository, not
  yet live.** `20261009140000_pulse_operational_month_container.sql` adds
  `tb810_ensure_operational_billing_period_system` (service_role only). The
  system Pulse (`server/obligations/pulse.ts`) calls it before evaluating
  progression. It inserts the current UTC month's Billing Period as
  `collecting_readings` if the row is absent, never updates an existing row,
  and its failure is reported in the Pulse result without gating progression.
  Handoff later reuses the row. Sedapal intake still resolves an existing
  Billing Period (`getBillingPeriodForBillDate`) and does not create one, so the
  container exists only once Pulse has run in that month. The DEV Pulse does
  not establish months. Until the migration is applied and the new Pulse is
  deployed, new rows still come only from handoff or approval.
- **Intake labels.** The Sedapal intake form shows a derived "Charge Month"
  (Service Month + 1). That is the source month, not the obligation month that
  consumes the bill (see [Water](../domain-models/water.md)).
