# Architecture Decision Register

This register is the canonical index of TB810 architecture decisions that have been frozen, implemented, or explicitly deferred.

Status meanings:

- Proposed: under discussion and not yet frozen
- Frozen: architecturally decided and expected to guide future work
- Implemented: present in the live codebase
- Deprecated: no longer part of the intended architecture

## Decisions

| Decision ID | Title | Status | Date Frozen | Last Reviewed | Related Documents | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| ARCH-001 | Architecture Audits precede implementation of unfamiliar domains | Frozen | 2026-07-29 | 2026-07-29 | [TB810 Water Domain](/Users/roon/dev/tb810/docs/tb810-water-domain.md), [Finance Architecture Freeze v1](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md), [Unit Accounts Domain](/Users/roon/dev/tb810/docs/domain-models/unit-accounts.md) | Prevents implementation drift by requiring architectural review before new domain work. |
| FIN-001 | Permanent Unit Accounts are the single financial ledger for a Unit | Frozen | 2026-07-29 | 2026-07-29 | [Finance Architecture Freeze v1](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md), [Unit Accounts Domain](/Users/roon/dev/tb810/docs/domain-models/unit-accounts.md) | Preserves asset-based debt history across ownership changes. |
| FIN-002 | Operational domains never own financial balances. They generate financial transactions | Frozen | 2026-07-29 | 2026-07-29 | [Finance Architecture Freeze v1](/Users/roon/dev/tb810/docs/architecture/finance-architecture-freeze-v1.md), [Unit Ledger Domain](/Users/roon/dev/tb810/docs/domain-models/unit-ledger.md) | Keeps financial responsibility in the permanent account/ledger layer. |
| WATER-001 | `tb810_meter_readings` is the canonical individual meter-reading table | Frozen | 2026-07-29 | 2026-07-29 | [TB810 Water Domain](/Users/roon/dev/tb810/docs/tb810-water-domain.md), [Schema Design](/Users/roon/dev/tb810/docs/tb810-schema-design.md) | Separates operational meter facts from utility billing records. |
| WATER-002 | `tb810_utility_bills` is the canonical Monthly Water Ledger (Sedapal/Common Water) | Frozen | 2026-07-29 | 2026-07-29 | [TB810 Water Domain](/Users/roon/dev/tb810/docs/tb810-water-domain.md), [Common Water Ledger](/Users/roon/dev/tb810/docs/domain-models/water.md) | Provides the persisted monthly Sedapal/common-water record and derived reading totals. |
| WATER-003 | Meter Readings are operational facts attached to Units | Frozen | 2026-07-29 | 2026-07-29 | [Units Domain](/Users/roon/dev/tb810/docs/domain-models/units.md), [TB810 Water Domain](/Users/roon/dev/tb810/docs/tb810-water-domain.md) | Keeps raw meter history on the asset boundary, not in finance records. |
| UX-001 | The Operations Workspace is the primary workspace for Guliana | Frozen | 2026-07-29 | 2026-07-29 | [TB810 Water Domain](/Users/roon/dev/tb810/docs/tb810-water-domain.md) | Establishes the operational focus for monthly water work. |
| UX-002 | The authenticated root URL is the user's operational home | Frozen | 2026-07-29 | 2026-07-29 | [URL Conventions](/Users/roon/dev/tb810/docs/architecture/url-conventions.md), [Confirmed Business Model](/Users/roon/dev/tb810/docs/architecture/confirmed-business-model.md) | Keeps the application centered on the role-specific home experience. |
| UX-003 | Business domains are first-class URLs without a `/workspace` prefix | Frozen | 2026-07-29 | 2026-07-29 | [URL Conventions](/Users/roon/dev/tb810/docs/architecture/url-conventions.md) | Lets URLs express the business domain directly. |
| UX-004 | Business objects live beneath their domain URL | Frozen | 2026-07-29 | 2026-07-29 | [URL Conventions](/Users/roon/dev/tb810/docs/architecture/url-conventions.md), [TB810 Water Domain](/Users/roon/dev/tb810/docs/tb810-water-domain.md) | Keeps `/water/{period}` as the Monthly Water Ledger object URL. |

## Notes

- Live implementation may lag behind frozen architecture.
- When a frozen decision and the live code disagree, the frozen architecture should be treated as the target baseline unless a separate decision marks it deprecated.
- Related documents should be updated when a decision is materially refined.
