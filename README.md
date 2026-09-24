# CareerOS · WI-002

A private personal workspace for planning time, practicing interviews, tracking applications, and reviewing progress. WI-002 extends the foundation with editable weekly routines, daily overrides, and actual-session execution. It does not implement the entire product.

## Engineering documentation

Start with the [engineering handbook](docs/README.md) for architecture, UFD/DFD, decision records, user stories and acceptance criteria, NFR evidence, onboarding and operations. Follow [CONTRIBUTING](CONTRIBUTING.md) for future changes and [SECURITY](SECURITY.md) for safe disclosure. Feature delivery does not mean every production-readiness gate is satisfied.

## Stack and architecture

Next.js 16 App Router, React, strict TypeScript, PostgreSQL, Prisma 7 with the native PostgreSQL adapter, Tailwind CSS 4, Zod, date-fns/date-fns-tz, pnpm, ESLint, Prettier, and Vitest. The project includes shadcn-compatible configuration and a small owned button primitive. Simple forms use Server Actions and native controls; React Hook Form is unnecessary at this scope.

- `src/app`: server-rendered routes, loading/error boundaries, protected notification endpoint.
- `src/components`: responsive shell, safe resource links, UI primitives.
- `src/features/schedule`: weekly recurrence domain rules and transactional generation.
- `src/features/notifications`: eligibility, durable scheduling, permission UI.
- `src/server`: database client, owner lookup, validated mutations.
- `src/lib`: environment, URL, local-time validation and time calculations.
- `prisma`: schema, versioned SQL migrations, repeatable example seed.
- `tests`: domain tests and opt-in real PostgreSQL integration tests.

The build uses Next.js’s supported webpack builder because Turbopack worker sockets were blocked in the implementation environment. TypeScript 6 and ESLint 9 are pinned to the versions supported by the current Next.js lint plugins; revisit these pins when plugin support catches up.

Server Components are the default. Client code handles active navigation, interactive form feedback, browser notification permission, display refresh, and error recovery. There are no client data stores, vendor services, timers pretending to be schedulers, or SaaS features.

## Local setup

Requires Node.js 22.12+ (24 LTS recommended), pnpm 11, and PostgreSQL 17+ or Docker Compose.

```sh
cp .env.example .env
# Set APP_PASSWORD and CRON_SECRET to distinct random values.
# Set OWNER_EMAIL to the single workspace owner's email.
pnpm install
# If PostgreSQL is not already available:
docker compose up -d db
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Open http://localhost:3000/today. Browser Basic Auth uses `OWNER_EMAIL` and `APP_PASSWORD`. The example seed creates Alex Morgan; edit the stored profile for your own name. The seed is explicitly development/example data, including a fictional job posting. Do not run it against a real personal dataset unless you want these examples. Repeating it preserves existing records, preferences, and progress; the next seven days are generated once from the saved routine. Default routines are inserted only when creating the seed owner for the first time. Existing owners keep their existing routines; rerunning seed never resurrects a deleted routine. This seed assumes one owner and is not a multi-user provisioning tool.

Environment variables (validated on protected requests and database access):

| Variable       | Use                                                            |
| -------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection, use provider-required TLS in production |
| `OWNER_EMAIL`  | Existing single owner's email and Basic Auth username          |
| `APP_PASSWORD` | Private workspace access, minimum 16 characters                |
| `CRON_SECRET`  | Scheduler bearer secret, minimum 32 characters                 |

No secrets belong in source control. No variables are exposed with `NEXT_PUBLIC_`. Production **requires HTTPS**; Basic Auth must not be used over plaintext internet connections. This is a minimal private deployment gate, not a full account/session system. Use ingress rate limiting or private network access for production. The proxy protects pages, Server Actions, service worker, and API; static build assets contain no personal data. The cron route accepts its separate bearer credential only. Mutations always scope data to the configured owner, and Next.js Server Actions retain their same-origin checks.

## Commands

```sh
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:check
# With TEST_DATABASE_URL set to a disposable migrated database:
pnpm test:ci
pnpm build
pnpm start
pnpm format
pnpm db:migrate --name describe_change
pnpm db:deploy
pnpm db:seed
```

`pnpm build` generates the Prisma client; pages are dynamic, so build does not need a live database. Runtime does. Run migrations as a deployment step before switching application traffic. Commit the lockfile and migration files. Integration tests require `TEST_DATABASE_URL` pointing to a migrated disposable database and are skipped otherwise; they create and remove their own isolated test user.

## Data storage

PostgreSQL is the durable source of truth for users, timezone, goals, daily plans, time blocks, actual sessions, DSA topics/problems/revision fields, learning topics, resources, jobs/interview dates, check-ins, weekly routines, notification preferences, and notification history. External calendar IDs and last-sync timestamps are reserved on blocks; there is no calendar integration.

React state holds only transient form/permission feedback; unsaved form edits are not persistent. No important data is stored in localStorage, browser caches, or server memory. The singleton database client is a connection pool, not data storage. **Restarting the web server does not lose application data.** Docker stores the database in the named `careeros_data` volume; `docker compose down` preserves it, while `down -v` deletes it.

Production can use any compatible managed PostgreSQL provider. Use connection pooling within your provider's limits, encrypted connections, least-privilege credentials, automatic backups and point-in-time recovery where available. Test restoration periodically. A database is durable but not a backup: web redeployment does not replace a backup strategy. Store `pg_dump` exports securely and avoid copying production data into developer logs.

Schema changes use checked-in SQL migrations (`prisma migrate dev` locally, `prisma migrate deploy` in production). The initial migration includes foreign keys, uniqueness, indexes, timestamp/date types, and additional SQL checks for durations, times, ratings, URL schemes, and resource attachment cardinality. Do not replace migrations with `db push` in production. Prisma does not express all SQL checks, so preserve them during future migrations.

The model uses text categories and titles for flexible user-defined goals. IELTS, CELPIP, AWS, and custom goals require no enum or schema change. Lifecycle statuses are enums. Resource rows have optional explicit foreign keys, with at most one attachment per row; unattached library links are permitted. Reuse a URL in separate rows when attaching it to several entities. Topic taxonomy is shared within this single-user installation; this is not tenant isolation.

## Scheduling model and daily execution

`RoutineBlock (weekly template) → DailyPlan (local date) → TimeBlock (dated plan) → ActualSession (what happened)`.

These are intentionally separate. Calendar allows you to navigate any Monday–Sunday week, open any day, generate one day or seven days, and create/edit/pause/re-enable/delete weekly routines. A routine accepts multiple weekdays, local start/end times, a custom category, optional goal/notes, and priority. A day accepts ad-hoc blocks and edits/reschedules across any date. All changes are stored in PostgreSQL; there are no hard-coded schedules in application behavior.

The Today route automatically ensures today's plan exists. Other dates are generated explicitly so browsing history does not invent work retroactively. An existing manually populated but not-yet-generated day can receive its routine blocks once, without changing the manual blocks. `DailyPlan.generatedAt` then marks the plan as a snapshot. Regeneration does nothing to already generated plans. Generation is transactional per day; a seven-day request may finish earlier dates before encountering a DST error on a later date, and it can be retried safely.

Generated blocks retain a unique `(routineKey, occurrenceDate)` identity using their original routine/date even after moving to another day. That prevents rescheduling and regeneration from recreating the original occurrence. `routineKey` deliberately has no cascading foreign key: deleting a template must not delete its execution history. Manual edits/status actions set `isOverride`; session-bearing and completed blocks are protected from routine propagation. The WI-002 migration conservatively marks all WI-001 blocks as overrides because their edit provenance was not recorded.

There are two explicit scopes:

- **Edit / reschedule this occurrence only:** modifies the dated plan, preserving the routine and actual sessions. Cancel removes it from active planning but retains the row/history and generated identity. Reset can restore it. Moving a block retains its current status.
- **Edit recurring routine:** by default affects only days not generated yet. Optionally select eligible future generated blocks. A server-computed preview lists the affected occurrences; confirmation applies only if the routine and proposed block versions still match. Changed weekdays create/cancel eligible occurrences. Overrides, blocks with sessions, completed/skipped work, and blocks whose start time has passed are excluded. Deleting a routine also requires preview and preserves existing instances unless future propagation was explicitly selected.

A new routine can be propagated to already generated days by opening its edit form and choosing future propagation after creation. Routine overlap checks compare weekly local intervals, including overnight/week-wrap cases. Dated overlap checks use UTC intervals across plans. Warnings identify conflicting blocks and allow an intentional override. Nothing is automatically moved or deleted to resolve a conflict. Editing next week through its dated plans never changes all future weeks.

**Actual execution:** Start records the server's timestamp and opens one session; Stop ends it without completing the plan; Start again creates another session; Complete ends a linked running session and marks the block complete. Completing without an active session does not invent actual time. Skip accepts a short reason, and Cancel records intentional removal. Stop a running session before skip/cancel/reschedule. Reset preserves prior sessions. An active session remains visible even when viewing another day, including an unlinked legacy session.

User-row transaction locks serialize scheduling/session mutations, and a PostgreSQL partial unique index independently enforces at most one open session per user. Manual actual entry rejects nonpositive durations, future end times, and overlaps with existing/open sessions. Adjacent intervals are allowed. Closed-session overlaps are enforced by the application under the same lock; direct SQL writers must respect the same contract. Session duration is derived, never stored independently.

The timeline distinguishes current, upcoming, completed, skipped, cancelled, and overdue/unrecorded blocks in text. Time passing never marks a block skipped. Visible idle pages refresh once a minute and on focus to update current/next and elapsed-time display; this is display refresh, not notification scheduling. Open editors and focused fields pause automatic refresh. Progress shows block counts separately from planned/actual focus minutes. Focus currently excludes `WORK`, `GYM`, and `PERSONAL`; other categories, including custom study categories, count. Actual minutes are clipped to the selected local day's boundaries; active sessions use server-now as their temporary end. Multiple applications remain independent records, with no one-to-one job-search/session relationship.

Daily review supports short optional notes, blocker, carry-forward, and 1–5 rating. Saving it upserts the check-in and marks the plan reviewed. Carry-forward is text for the user to act on, not automatic rescheduling.

## Timezones

`DailyPlan.date`, occurrence dates, and goal target dates are SQL dates, not UTC instants. Execution timestamps use PostgreSQL `timestamptz` and render in the stored IANA zone (`America/Toronto` by default). Local date arithmetic uses UTC calendar fields rather than the host machine's timezone. Independently calculated day boundaries correctly produce 23-hour and 25-hour DST days.

Recurring end time at or before start means the following day; dated/manual forms have separate start/end dates and require end > start. A nonexistent spring-forward time is rejected with a visible error instead of silently moved. Generation rolls back that day until the routine is adjusted. Ambiguous Toronto fall-back times choose the earlier occurrence consistently with date-fns-tz, as tested. The UI does not yet offer a later-occurrence selector; avoid logging the second repeated hour through these forms until that UI is added. The timezone is shown beside scheduling forms. Changing a profile timezone does not reinterpret existing UTC blocks. Notification preferences retain their own timezone.

## Migration from WI-001

Run `pnpm db:deploy` before launching the updated app. Migration `20260923200000_daily_execution` converts each single weekday into a weekday array, adds routine notes/priority, occurrence identity and override tracking, generation markers, skip reasons, review carry-forward, and the partial unique running-session index. Existing plans, blocks, sessions, resources, and calendar identifiers are preserved. The migration intentionally fails if pre-existing data contains multiple open sessions for a user; reconcile those records explicitly rather than silently discarding them. No Google Calendar synchronization is implemented.

## Notifications

A deployment scheduler must POST to `/api/notifications/process` every minute with `Authorization: Bearer <CRON_SECRET>`. Example manual invocation with the secret already in your shell environment:

```sh
curl --fail -X POST https://your-private-host/api/notifications/process \
  -H "Authorization: Bearer $CRON_SECRET"
```

The server checks enabled preferences for daily progress, missed check-in, upcoming block, overdue task, job follow-up, interview, and DSA revision. It creates persistent NotificationLog records; Today displays due unread records. An absent plan also qualifies for daily progress/check-in reminders. Reviewing progress and completing the daily check-in are distinct concepts; checking in also marks progress reviewed.

A unique occurrence key prevents duplicate records across retries or overlapping scheduler calls. Review reminders use user + type + local date; blocks/jobs/problems also include the scheduled occurrence. Read state persists. `sentAt` remains null because no external delivery has happened. Scheduler retries are safe; failures return HTTP 500, and logs remain durable. Reminder processing shares the per-user transaction lock with daily review and execution. Start, progress recording, status changes, and rescheduling dismiss stale unread block reminders; review dismisses that day’s unread review reminders. New upcoming/overdue alerts only target planned blocks with no actual sessions.

**Closed-app delivery is not implemented.** Cron runs independently of browser tabs and creates the inbox records while the application is closed, but it does not send an OS alert. WI-001 has a user-triggered permission UI, a service worker that opens Today on notification click, and a test notification. There is no subscription storage, VAPID credential, Web Push sender, or misleading background-delivery claim. The next transport step is a push-subscription model, authenticated subscription endpoints, a push event handler, and a retryable per-subscription delivery outbox. Unique reminder creation alone would not guarantee exactly-once push delivery.

Browser notifications require user permission and a secure context (HTTPS or localhost). Support differs across browsers; iOS web push generally requires an installed Home Screen web app. Permission can be denied or revoked, OS focus modes can suppress alerts, and background delivery is never an exact-time guarantee. The service worker intentionally caches no personal pages. There is no installable PWA manifest/offline mode yet.

Block reminder processing uses timestamp windows across local midnight: upcoming reminders target the configured lead window and overdue reminders cover the preceding 24 hours. Missed upcoming windows are not replayed as upcoming alerts. The scheduler processes dated blocks only; generate the next seven days if reminders are needed before opening each day. Job follow-ups/interview windows expire after 24 hours. Due DSA revisions remain eligible, deduped per revision instant. A larger retrospective catch-up policy, stale-reminder cleanup, transport retries, and preference editing for every type remain future work.

## Before WI-003

Review authentication/session UX, closed-session correction/deletion, a later-occurrence DST selector, configurable focus categories, actual-session overlap policy, large schedule propagation performance, and background Web Push delivery requirements. Templates do not have an effective-from date: the default scope means ungenerated days, including a historical day explicitly generated later. No drag-and-drop or complex recurrence engine is included. Decide on database hosting, HTTPS ingress and rate limits, backup/restore operations, and an authenticated minute-level scheduler before production deployment. Google Calendar OAuth/sync, automatic applications, AI planning, and advanced analytics are explicitly not implemented.
