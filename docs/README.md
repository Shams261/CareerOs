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

See the [WI-008.1 handoff](WI-008.1-HANDOFF.md) for the Heroku container deployment path and database TLS setting.

See the [WI-008.2 handoff](WI-008.2-HANDOFF.md) for the Render + Supabase free-tier path.

See the [WI-008.3 handoff](WI-008.3-HANDOFF.md) for the post-launch polish from the production acceptance pass.

See the [WI-009 handoff](WI-009-HANDOFF.md) for the UX simplification (first-run cards, visible actions, plain words, three-step weekly review) and the goals and roadmap layer.

See the [WI-010 handoff](WI-010-HANDOFF.md) for the week chart, light motion and notes to self.

See the [WI-011 handoff](WI-011-HANDOFF.md) for the UX pass: undo, summaries, phone navigation.

See the [WI-020 handoff](WI-020-HANDOFF.md) for Today as an agenda: the launcher, the open agenda list, the Needs attention list and the side panels, with screenshots.

See the [WI-021 handoff](WI-021-HANDOFF.md) for Plan as days: the shared block row, the week strip, the Routines panel and the switch to 24-hour times.

See the [WI-022 handoff](WI-022-HANDOFF.md) for Jobs as moves: application rows and the attention rail in Today's words, one primary per application page, round forms in panels, and the interview-block fixes.

See the [WI-023 handoff](WI-023-HANDOFF.md) for Roadmap as rows: Continue as the primary, goal record lines, roadmap rows, the Due for revision rail and the detail page without bars.

See the [WI-024 handoff](WI-024-HANDOFF.md) for the Weekly review: one summary line, day sections with the shared block rows, next-week rows and Details without a second reminder form.

See the [WI-025 handoff](WI-025-HANDOFF.md) for Settings as rows: the record line, reminder and calendar rows with panels, and the theme control.

See the [WI-026 handoff](WI-026-HANDOFF.md) for the public privacy page and how to publish the Google app.

See the [Version 2 plan](product/v2-plan.md) and the [WI-027 handoff](WI-027-HANDOFF.md) for the Focus session, the first Version 2 slice; the [R1–R3 handoff](V2-R1-R3-HANDOFF.md) for the test data check, lock-screen privacy and notification opened and feedback; the [WI-028 handoff](WI-028-HANDOFF.md) for Study Nudges and Rest today; the [WI-029 handoff](WI-029-HANDOFF.md) for Close the Day; the [WI-030 handoff](WI-030-HANDOFF.md) for the Which pattern? and Watch it run drills; the [WI-031 handoff](WI-031-HANDOFF.md) for Grill Me and the AI foundation; the [WI-032 handoff](WI-032-HANDOFF.md) for the revision deck and problem hints; the [WI-033 handoff](WI-033-HANDOFF.md) for the Day Print; the [WI-034 handoff](WI-034-HANDOFF.md) for Look Back and Moments; the [WI-035 handoff](WI-035-HANDOFF.md) for ambient sound in Focus; the [WI-036 handoff](WI-036-HANDOFF.md) for the ⌘K command bar; the [WI-037 handoff](WI-037-HANDOFF.md) for Listen. The [Rumi plan](product/rumi-plan.md) is the next phase; its first item is the [WI-038 handoff](WI-038-HANDOFF.md) (readable previews, Practice hints removed), then the [WI-039 handoff](WI-039-HANDOFF.md) (coach notifications) the [R5 spike](R5-HANDOFF.md) behind ADR-024, the [WI-040 handoff](WI-040-HANDOFF.md) (Ask Rumi) the [WI-041 handoff](WI-041-HANDOFF.md) (Rumi plans) the [WI-042 handoff](WI-042-HANDOFF.md) (interview prep docs) the [WI-043 handoff](WI-043-HANDOFF.md) (Rumi noticed) the [WI-044 handoff](WI-044-HANDOFF.md) (security upgrade) the [WI-045 handoff](WI-045-HANDOFF.md) (fresh start) the [WI-046 handoff](WI-046-HANDOFF.md) (one truth for problems) the [WI-047 handoff](WI-047-HANDOFF.md) (interview formats) and the [WI-048 handoff](WI-048-HANDOFF.md) (this week's mix).
