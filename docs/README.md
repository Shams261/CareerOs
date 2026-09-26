# Engineering handbook

Silsila (formerly CareerOS) is a single-owner personal application. WI-001 through WI-008 are implemented. WI-008 adds the production launch path; the go-live evidence that only a real deployment can produce is tracked separately in the NFR register. This handbook describes the code that exists, not a hypothetical future SaaS.

See the [Silsila brand system](product/brand-system.md) for visual identity, accessibility choices and compatibility boundaries.

## Start here

1. Follow [local setup](../README.md#local-setup) and run the validation commands.
2. Read [product scope and stories](product/user-stories.md) for expected behavior and acceptance criteria.
3. Follow the [user flow diagrams (UFD)](product/user-flows.md).
4. Read [architecture](architecture/overview.md), [data flow diagrams (DFD) and data model](architecture/data-flows.md), and [decision records](architecture/decisions.md).
5. Read [contribution workflow](../CONTRIBUTING.md), [NFR evidence and release gates](engineering/non-functional-requirements.md), and [operations](engineering/operations.md).
6. Deploying or operating: [deployment guide](engineering/deployment.md), [environment reference](engineering/environment.md), [security](engineering/security.md), [backup and restore](engineering/backup-restore.md), [notifications and PWA](engineering/notifications-pwa.md), [Google production checklist](engineering/google-production.md) and the owner's [onboarding checklist](product/onboarding.md).
7. Consult the historical [WI-002 handoff](WI-002-HANDOFF.md) for its implementation-time validation. Temporary screenshots referenced there are not durable repository artifacts.

See the [WI-003 handoff](WI-003-HANDOFF.md) for the DSA learning/revision engine and CI changes.

## Documentation ownership and change policy

The repository maintainer owns the handbook until module owners are appointed. Every behavior change must update the affected story, acceptance criteria, diagrams/contracts, tests and NFR evidence in the same PR. A changed architecture decision gets a new ADR that supersedes the old record; do not rewrite history to make a previous decision look inevitable.

Stable identifiers: `US-xxx` for stories, `NFR-xxx` for non-functional requirements, and `ADR-xxx` for decisions. Work items group stories; they do not replace acceptance criteria. New engineers should trace story → source → tests → NFR evidence before editing code.

Status meanings: **Implemented** means behavior is present; **Partial** means a foundation exists with stated omissions; **Proposed** means no delivery promise. **Verified locally** is not the same as measured in production. Record command/environment/date or a CI run URL when updating evidence.

[Changelog](../CHANGELOG.md) records product changes. [Security policy](../SECURITY.md) explains safe reporting. The PR and issue templates keep this workflow usable for future contributors.

See the [WI-004 handoff](WI-004-HANDOFF.md) for technical learning and validation scope.

See the [WI-005 handoff](WI-005-HANDOFF.md) for the job search and interview pipeline.

See the [WI-005.1 handoff](WI-005.1-HANDOFF.md) for UTC database sessions, legacy timestamp repair and schema drift.

See the [WI-006 handoff](WI-006-HANDOFF.md) for Google Calendar sync.

See the [WI-007 handoff](WI-007-HANDOFF.md) for the weekly review and planning loop.

See the [WI-008 handoff](WI-008-HANDOFF.md) for the production launch and hardening.
