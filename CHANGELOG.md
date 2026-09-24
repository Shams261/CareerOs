# Changelog

## Unreleased

- WI-006: Google Calendar sync of dated TimeBlocks to a dedicated CareerOS calendar (`calendar.app.created` scope). Adds OAuth with PKCE, AES-256-GCM-encrypted refresh tokens, incremental sync with 410 recovery, idempotent creates, If-Match pushes and durable conflicts (Keep CareerOS / Use Google).
- Google edits become dated overrides (routines untouched) and deletions cancel or detach. Adds optional validated push channels, a cron sync endpoint, category selection, reauth/disconnect flows, and interviews on the schedule as linked blocks.

- WI-005.1: every database session is pinned to UTC (app, migrations, seed, scripts, tests), with a startup check. Adds `timestamps:audit` and guarded `timestamps:repair` (dry-run default, DST-exact, integrity rollback, ledger prevents a second run) for legacy non-UTC local databases.
- Removed the unusable `RoutineBlock.weekdays` default; Prisma schema and database have no drift.

- WI-005: job pipeline with quick add, duplicate confirmation, append-only timeline/stage history, action owner (me vs waiting on company) and needs-attention ranking.
- Interview rounds with original timezone, reschedule history, results/reflections, per-round prep and weak-area links to learning/DSA (read-only mentions).
- `/jobs` dashboard and filters, application detail page, Today interview and job-search sections, factual weekly counts.
- Deduplicated follow-up (per planned date) and interview (~24h + short window) reminders; legacy job data migrated without invented history; new-owner-only examples.

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
