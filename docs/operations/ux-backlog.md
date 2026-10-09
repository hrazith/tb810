# TB810 UX Backlog

Deferred UX improvements. Backlog items use the `UXB` prefix. `UX-001` to `UX-004` belong to the [architecture decision register](../architecture/architecture-decision-register.md).

Last updated: October 8, 2026.

| ID | Item | Priority | Status |
|---|---|---|---|
| UXB-001 | Unit Detail: Charge Visibility | Later | Deferred |
| UXB-002 | Carlos Approval: Charge Explanation | Before Carlos's independent review | Deferred |
| UXB-003 | Upcoming Charge Editor: Current Package Month | Later | Deferred |

## UXB-001 — Unit Detail: Charge Visibility

**Observed behavior:** The standalone Unit detail page (for example `/units/504`) does not show the Unit's itemized monthly charges or their descriptions. The Obligations workspace shows them, but the Unit detail page does not.

**Expected behavior:** Staff can see the Unit's applicable charges on the Unit detail page, with each charge's description, amount and billing period, without going to the Obligations workspace.

**Priority:** Later

**Status:** Deferred

## UXB-002 — Carlos Approval: Charge Explanation

**Observed behavior:** Carlos's approval view shows only the total "Other charges" amount, without the descriptions of the charges behind it.

**Expected behavior:** Before approving, Carlos can inspect each charge that contributes to an obligation: its Unit, description and amount. The existing approval calculation and financial totals stay unchanged.

**Priority:** Before Carlos's independent review

**Status:** Deferred

## UXB-003 — Upcoming Charge Editor: Current Package Month

**Observed behavior:** The upcoming-charge edit form in `app/(staff)/obligations/page.tsx` offers only start months after the workspace month. The server's corrected lifecycle rule also allows the active package month, but the form doesn't offer it.

**Expected behavior:** The form offers every month the canonical package lifecycle allows, including the active package month, and excludes approved and historical periods.

**Priority:** Later

**Status:** Deferred
