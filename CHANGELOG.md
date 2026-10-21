# Changelog

## Unreleased

- WI-009: UX simplification for first use. Today, Practice, Learn and Jobs open with a single **Start here** card until the first routine, topic, subject or application exists; a new routine is added to the days already planned from today on, so the first routine shows on Today (ADR-015), and the current week plans itself when Today or Plan is viewed (the manual "Generate plans" control is gone). Forms open in place from real buttons (`Disclosure`) instead of `<details>`, with one visible primary action per page. Copy uses plain words ("Changed for this day", "Added for this day", "Did you solve it yourself?"), explanatory paragraphs under forms are removed, taglines and the "PERSONAL WORKSPACE" label are gone, and the date or the page name is the heading. Filters appear only once a list has more than eight items; zero counters and empty cards are hidden. The weekly review is three steps (This week, Reflect, Next week) with a Details view holding every fact. The sidebar reads Today, Plan, Practice, Learn, Jobs, Weekly review, Settings (routes unchanged); the Google Calendar panel moves to Settings and Plan shows a one-line status. Form feedback shows a pending state on the pressed button and a success message beside it that clears after three seconds.

- WI-008.3: post-launch polish from the production acceptance pass. Calendar generates from today and its "for tomorrow" hint is correct; validation messages name fields in words instead of schema keys; DSA topic, learning subject and learning topic forms clear after a save; "1 attempt" and "1 priority" pluralise; actual sessions list in time order; Start is hidden on days after today; a finished session shorter than a minute reads "under a minute"; the daily reminder form confirms its save; the routine section explains that already-generated days keep their plan; learning reminder copy no longer claims there is no push.
- Fix: the Google Calendar OAuth callback redirects to the public origin instead of the proxied request host.
- Go-live recorded: Silsila runs at https://usesilsila.me on Render with Supabase PostgreSQL; scheduler on cron-job.org; Google OAuth app in Testing pending a privacy page (see WI-008.2 handoff section 8).

- Fix: the production container starts Next.js directly (`node node_modules/next/dist/bin/next start`) and pnpm's `verifyDepsBeforeRun` is disabled. On Render the first deploy died with `EACCES` because `pnpm start` decided the production modules were stale after the host re-layered the image and tried `pnpm install --production` as the unprivileged user.

- WI-008.2: Render + Supabase free-tier deployment path (ADR-014) while the Heroku student credit is pending. `render.yaml` blueprint (Docker runtime, health check, deploy after checks pass, generated secrets); deployment guide rewritten around Render and the Supabase session pooler with Heroku kept as the alternative; operations and environment notes for workstation-run migrations and backups. No code change; the same image runs on either host.

- WI-008.1: Heroku container deployment path. Multi-stage `Dockerfile`, `.dockerignore` and `heroku.yml`; a `docker compose --profile app` rehearsal with a configurable database port; `DATABASE_SSL` (`off`, `no-verify`, `verify-full` with optional `DATABASE_SSL_CA`) applied to the app pool, the start-up time-zone check, the Prisma CLI and the timestamp scripts; the Prisma CLI and `tsx` become runtime dependencies so migrations and audits run from the image; a CI job builds the image and checks fail-fast validation inside it; ADR-013 and the deployment, environment and operations guides describe the Heroku sequence.

- Theme selection defaults to Light regardless of OS/browser appearance. Settings offers explicit Light/Dark choices persisted per browser, with server-rendered theme class and browser color to avoid an incorrect initial theme.

- Silsila brand system: three-ring identity, horizontal and stacked lockups, locally hosted Inter/Cormorant typography, warm ivory/teal and system dark palettes, shared component polish, refreshed login/Today/Weekly Review, PWA icons and notification copy. Existing data, sessions and calendar ownership identifiers remain compatible.

- WI-008: personal production launch. Google sign-in (OIDC, PKCE, state, nonce, `openid email`) restricted to `OWNER_EMAIL`, hashed server-side sessions with sign-out and 30-day expiry, and a proxy gate for every private page and API. Replaces Basic Auth; `APP_PASSWORD` is no longer used.
- Closed-app Web Push (VAPID) on top of the reminder inbox: per-device opt-in, test notification, bounded retries, dead-device clean-up, and a daily progress reminder that reaches a closed app. Installable PWA manifest and icons; no offline mode.
- Hardening: nonce CSP and security headers, HSTS in production, rate limits on public endpoints, fail-fast environment validation, `/api/health`, scheduler run status in Settings, sanitized logs, JSON data export, `db:backup` and scratch-only `db:restore:verify`, contrast and focus fixes (axe clean), and a getting-started checklist.

- WI-007: weekly review at `/review` for owner-local weeks: planned vs actual, day-by-day execution, routine counts, DSA/learning/job facts, interview reflections and carry-forward, all derived live. Stores only the reflection and up to five ordered priorities.
- Next-week context (routine preview, interviews with prep, dues) and an idempotent **Prepare next week** that reuses the plan generator; Google publishing stays downstream. Adds a Sunday Today prompt and a once-per-week `WEEKLY_REVIEW` reminder. Calendar sync now generates only the current week.

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
