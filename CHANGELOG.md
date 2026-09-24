# Changelog

## Unreleased

- WI-004: custom technical subjects, primary focus, ordered topics, four-dimensional mastery and append-only learning activities.
- Deterministic concept review policy, manual dates, subject/topic dashboards, notes/resources, Today suggestions and weekly measured summaries.
- Owner-scoped transactional writes and idempotent activities; optional study-session linking and one daily preference-aware technical reminder.
- Preserve legacy learning records in imported subjects; new-owner-only examples and 17-table repeatable seed verification.
- Acceptance fixes: save confirmations persist on activity/attempt forms, legacy ready topics stay editable, free-text technical categories match.

- WI-003: current DSA topic, editable problem library, append-only attempts, bounded spaced revision, manual due dates and local-day queues.
- DSA details expose mistakes/history and optional actual-session context; Today shows due work and cron emits one daily revision reminder.
- Preserve legacy counts and convert revision instants to owner-calendar dates; add clean/upgrade migration and seed-idempotency coverage.
- Cache dependency/compiler work in CI; generate Prisma once and use the production build's TypeScript check.

- Engineering handbook: architecture, ADRs, UFD/DFD, user stories and NFR evidence.
- Contribution, security and operational runbooks; GitHub story/bug/PR templates.
- CI workflow with PostgreSQL, frozen install, migrations, seed repeat, lint, type checks, all tests, documentation links and build.

## 0.1.0 — Development baseline (WI-001 and WI-002)

This labels the package's development baseline, not a published release or production deployment.

- PostgreSQL-backed personal workspace, private owner gate and responsive application shell.
- Today, DSA, learning, jobs, calendar, review and settings foundations.
- Editable weekly routines and dated overrides with safe generation and propagation previews.
- Actual-session start/stop/complete, skip/cancel, manual logging and daily review.
- Durable cron-driven reminder inbox; no closed-app push delivery.
- Two schema migrations and 50 verified domain/database tests at the baseline.
