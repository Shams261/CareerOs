# Engineering handbook

Silsila (formerly CareerOS) is a single-owner personal execution system, live at <https://usesilsila.me>. This handbook describes the code that exists. The latest work item and the next step are at the top of `CLAUDE.md`; every change is in the [changelog](../CHANGELOG.md).

## Start here

1. [Local setup](../README.md#local-setup), then the [contribution workflow](../CONTRIBUTING.md).
2. [Architecture](architecture/overview.md): runtime, code layers, read and write contracts, time storage.
3. [Features](architecture/features.md): what each part does and where it lives.
4. [Decision records](architecture/decisions.md): ADR-001 to ADR-031, append-only.
5. [Rumi 2 architecture](architecture/rumi-2.md) and the [Rumi 2 and 3 plan](product/rumi2-plan.md).

## Product

- [Brand system](product/brand-system.md): identity, tokens, copy rules, design principles, pending artwork.
- [Onboarding](product/onboarding.md): the owner's first steps.

## Operating

- [Deployment](engineering/deployment.md) and [environment](engineering/environment.md)
- [Operations](engineering/operations.md): release checklist, scheduled jobs, alerts, measuring a page's queries, incidents
- [Backup and restore](engineering/backup-restore.md), including the personal database migration checklist
- [Security](engineering/security.md) and the [security policy](../SECURITY.md)
- [Notifications and PWA](engineering/notifications-pwa.md)
- [Google production setup](engineering/google-production.md)

## Handoffs and history

Each work item ends with `docs/WI-NNN-HANDOFF.md` (gate results, owner steps). `docs/` keeps the last ten and [WI-012](WI-012-HANDOFF.md), which the curriculum links to; older ones, the screenshots and the finished plans are in the archive tag described in [HISTORY](HISTORY.md).

Stable identifiers: `WI-NNN` for work items and `ADR-NNN` for decisions. A changed decision gets a new ADR or a dated amendment; existing records are not rewritten.
