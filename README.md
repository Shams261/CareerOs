# CareerOS · WI-004

A private personal workspace for planning time, practicing interviews, tracking applications, and reviewing progress. WI-002 adds editable weekly routines, daily overrides, and actual-session execution. WI-003 adds DSA topic/problem management, attempt history and spaced revision. WI-004 adds technical subjects, four-dimensional mastery, learning history and review queues. It does not implement the entire product.

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
pnpm timestamps:audit    # read-only; see Legacy local database repair
pnpm timestamps:repair   # dry-run unless --apply --confirm=<database>
```

`pnpm build` generates the Prisma client; pages are dynamic, so build does not need a live database. Runtime does. Run migrations as a deployment step before switching application traffic. Commit the lockfile and migration files. Integration tests require `TEST_DATABASE_URL` pointing to a migrated disposable database and are skipped otherwise; they create and remove their own isolated test user.

## Data storage

PostgreSQL is the durable source of truth for users, timezone, goals, daily plans, time blocks, actual sessions, DSA topics/problems/attempts/revision fields, learning topics, resources, jobs/interview dates, check-ins, weekly routines, notification preferences, and notification history. External calendar IDs and last-sync timestamps are reserved on blocks; there is no calendar integration.

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

Recurring end time at or before start means the following day; dated/manual forms have separate start/end dates and require end > start. A nonexistent spring-forward time is rejected with a visible error instead of silently moved. Generation rolls back that day until the routine is adjusted. Ambiguous Toronto fall-back times choose the earlier occurrence consistently with date-fns-tz, as tested. The UI does not yet offer a later-occurrence selector; avoid logging the second repeated hour through these forms until that UI is added. The timezone is shown beside scheduling forms. Changing a profile timezone does not reinterpret existing UTC blocks. Notification preferences retain their own timezone; DSA daily reminders specifically follow the owner timezone so their dates agree with the revision queue.

See [Time storage policy](#time-storage-policy-wi-0051): every application database session is pinned to UTC, whatever the PostgreSQL server default is.

## Migration from WI-001

Run `pnpm db:deploy` before launching the updated app. Migration `20260923200000_daily_execution` converts each single weekday into a weekday array, adds routine notes/priority, occurrence identity and override tracking, generation markers, skip reasons, review carry-forward, and the partial unique running-session index. Existing plans, blocks, sessions, resources, and calendar identifiers are preserved. The migration intentionally fails if pre-existing data contains multiple open sessions for a user; reconcile those records explicitly rather than silently discarding them. No Google Calendar synchronization is implemented.

## Notifications

A deployment scheduler must POST to `/api/notifications/process` every minute with `Authorization: Bearer <CRON_SECRET>`. Example manual invocation with the secret already in your shell environment:

```sh
curl --fail -X POST https://your-private-host/api/notifications/process \
  -H "Authorization: Bearer $CRON_SECRET"
```

The server checks enabled preferences for daily progress, missed check-in, upcoming block, overdue task, job follow-up, interview, and DSA revision. It creates persistent NotificationLog records; Today displays due unread records. An absent plan also qualifies for daily progress/check-in reminders. Reviewing progress and completing the daily check-in are distinct concepts; checking in also marks progress reviewed.

A unique occurrence key prevents duplicate records across retries or overlapping scheduler calls. Review and DSA reminders use user + type + local date; blocks/jobs include the scheduled occurrence. Read state persists. `sentAt` remains null because no external delivery has happened. Scheduler retries are safe; failures return HTTP 500, and logs remain durable. Reminder processing shares the per-user transaction lock with daily review and execution. Start, progress recording, status changes, and rescheduling dismiss stale unread block reminders; review dismisses that day’s unread review reminders. New upcoming/overdue alerts only target planned blocks with no actual sessions.

**Closed-app delivery is not implemented.** Cron runs independently of browser tabs and creates the inbox records while the application is closed, but it does not send an OS alert. WI-001 has a user-triggered permission UI, a service worker that opens Today on notification click, and a test notification. There is no subscription storage, VAPID credential, Web Push sender, or misleading background-delivery claim. The next transport step is a push-subscription model, authenticated subscription endpoints, a push event handler, and a retryable per-subscription delivery outbox. Unique reminder creation alone would not guarantee exactly-once push delivery.

Browser notifications require user permission and a secure context (HTTPS or localhost). Support differs across browsers; iOS web push generally requires an installed Home Screen web app. Permission can be denied or revoked, OS focus modes can suppress alerts, and background delivery is never an exact-time guarantee. The service worker intentionally caches no personal pages. There is no installable PWA manifest/offline mode yet.

Block reminder processing uses timestamp windows across local midnight: upcoming reminders target the configured lead window and overdue reminders cover the preceding 24 hours. Missed upcoming windows are not replayed as upcoming alerts. The scheduler processes dated blocks only; generate the next seven days if reminders are needed before opening each day. Job follow-ups produce one reminder per application per planned date (not repeated while overdue); interviews produce a ~24-hour reminder and a configurable short reminder, keyed by start time so a reschedule re-arms them (see the job search model below). Due DSA revisions remain eligible and produce one daily aggregate reminder per owner-local date. A larger retrospective catch-up policy, stale-reminder cleanup, transport retries, and preference editing for every type remain future work.

## Before WI-004

Review authentication/session UX, closed-session correction/deletion, a later-occurrence DST selector, configurable focus categories, actual-session overlap policy, large schedule propagation performance, and background Web Push delivery requirements. Templates do not have an effective-from date: the default scope means ungenerated days, including a historical day explicitly generated later. No drag-and-drop or complex recurrence engine is included. Decide on database hosting, HTTPS ingress and rate limits, backup/restore operations, and an authenticated minute-level scheduler before production deployment. Google Calendar OAuth/sync, automatic applications, AI planning, and advanced analytics are explicitly not implemented.

## DSA learning model

`DsaTopic → DsaProblem → DsaAttempt → Confidence → Revision Engine`

Choose a current topic in `/dsa`, add problems from any HTTP(S) website, solve externally, then record an attempt on the problem detail page. Topics support ordering, Learning, Revising (`NEEDS_REVISION`), Interview ready, Completed and Paused; the existing status vocabulary is retained. Only one topic can be current per owner. Paused/completed/not-started topics cannot be current. The topic catalog remains shared in this single-owner architecture; multi-tenant topic ownership is outside WI-003.

- **RED:** could not independently derive a correct approach. Review in **1 day**, reset progression.
- **YELLOW:** understand the pattern, but need help or are unreliable. Review in **3 days**, reset progression so the next Green starts at 7.
- **GREEN:** independently solve and explain the approach, implementation and complexity. Consecutive Green attempts schedule **7 → 14 → 30 → 30 days**.

Independence and confidence must agree: `NO/PARTIAL → RED/YELLOW`, `YES → YELLOW/GREEN`. Completing a scheduled block never awards confidence. The pure policy lives in `src/features/dsa/domain.ts`.

Revision dates are PostgreSQL `DATE` calendar labels. Toronto is the default timezone; due status changes at the owner's local midnight, not UTC midnight. New dates are calculated from the date of the actual attempt, including when the previous revision is overdue. Overnight/DST days do not change the interval in calendar days. Queue priority is overdue Red/Yellow/Green, then today's Red/Yellow/Green; oldest date first within each group.

| State             | Meaning                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| New / unattempted | No recorded attempts; not included in the revision queue                                          |
| Due today         | Revision date equals the owner's current local date                                               |
| Overdue           | Revision date is before that date; stays unchanged until an attempt or explicit adjustment        |
| Upcoming          | A practiced problem has a future revision date                                                    |
| Unscheduled       | Legacy practiced summary has no revision date; the next attempt or manual adjustment schedules it |

A manual revision date is marked explicitly and preserves progression/history. The next attempt resumes automatic scheduling. Attempts are append-only through the application; there is no edit/delete/backdate UI. Existing summary-only counts are preserved and disclosed as legacy history, never reconstructed into invented attempts. A new unique problem is counted once regardless of revision count.

A **DSA TimeBlock** defines planned time; an **ActualSession** records actual work; a **DsaAttempt** records a problem learning outcome. Recording an attempt links an active owned session with category `DSA` when available, but never requires or creates a timer. Optional attempt duration is self-reported and does not create actual tracked time. On Today, a scheduled non-cancelled DSA block shows the automatic queue without rewriting the schedule.

One daily inbox reminder is created per owner/local date at or after the DSA reminder's preferred time, only when enabled and practiced problems are due. New owners default to 07:00; existing preferences are preserved. The count is a snapshot when created. External cron is still required; closed-app Web Push remains unsupported.

See [WI-003 handoff](docs/WI-003-HANDOFF.md) for migration, checks, limits and rollback considerations.

## Technical learning model (WI-004)

LearningSubject → LearningTopic → LearningActivity → Mastery → Review Scheduling.

Subjects are custom data, not enums. Multiple subjects can be active; one is the primary focus. Topics retain notes/resources and simple parent-child organization. Four mastery dimensions describe **understanding**, **recall**, **application** and **interview**: 0 unassessed, 1 weak, 2 partial, 3 strong. Blank assessment fields preserve previous values; explicit unassessed clears a rating.

Readiness is deterministic: all four strong → Interview Ready; any weak score or partial recall/application/interview → Needs Review; otherwise Learning. Not Started, Paused and Completed are lifecycle controls. Legacy statuses remain until reassessment. Interview readiness can regress.

An assessment schedules Learning in 2 days, Needs Review in 3, newly Interview Ready in 14; a ready topic freshly confirmed strong in recall/application/interview gets 30. This differs from DSA's independence/confidence progression. Notes and unassessed reviews do not postpone an existing date. Manual dates are marked and replaced by the next assessment. Only active subjects and eligible topics enter overdue/today/upcoming queues.

TimeBlock determines **when**. LearningActivity records **what happened**. An owned active TECHNICAL/SYSTEM_DESIGN session (or session matching the subject's goal) may be linked; logging remains possible without a timer and never changes session timestamps. Weekly time uses actual session intervals, never planned time or duplicated activity-duration totals.

`/learn` contains subject management, review queues, focus, recent activities and reminder preferences. Subject/topic pages provide ordering, filters, mastery, plain-text notes, safe resource links, fast activity logging and manual reviews. Today shows suggestions for appropriate scheduled blocks. Notifications are daily deduplicated inbox records, not closed-app push.

The new migration preserves existing topics in an “Imported learning” subject per owner without inventing history. New-owner seeds add TypeScript, Node.js, PostgreSQL and System Design examples; existing owners receive no new learning examples on seed reruns. See [WI-004 handoff](docs/WI-004-HANDOFF.md) and [ADR-007](docs/architecture/decisions.md#adr-007--concept-mastery-is-distinct-from-dsa-confidence-wi-004).

## Job search model (WI-005)

JobApplication → JobActivity (stage history + timeline) → InterviewRound → InterviewPrepItem.

**JobApplication** is the opportunity being pursued and keeps the current summary: company, role, job URL, location, work arrangement, employment type, free-text source, applied date, current stage, priority, recruiter/hiring contacts, notes, offer/compensation notes, job-description snapshot, next action, next-action date and **action owner**. Only company and role are required; quick add also takes URL, source, applied date and stage. Stages reuse the existing `JobStage` enum (Saved → Applied → Recruiter screen → Assessment → Technical → System design → Behavioral → Final → Offer, plus Rejected/Withdrawn). Rejected and Withdrawn are closed: kept, filterable, never in attention lists. Any stage can move to any other (reopening is allowed); leaving Saved records today's owner-local applied date if none exists. Job URLs and meeting links must be HTTP(S) without credentials and open with `rel="noopener noreferrer"`; pages are never fetched or scraped. An exact company + role + URL match (case/space-insensitive) asks for confirmation; different roles at one company are normal.

**JobActivity** is one append-only timeline instead of separate history tables: created, stage changed (from/to), interview scheduled/rescheduled (previous and new start preserved), interview result, next action set/done and explicit notes. Stage changes, interview results with an optional stage move, and follow-up completion write their history in the same owner-locked transaction as the summary change. Request IDs make retries idempotent; reusing one for another application is rejected. History has no edit/delete path.

**InterviewRound** stores a real instant (`scheduledStart`, optional `scheduledEnd`) plus the IANA zone it was entered in. Times display in the owner's zone, with the original zone shown when different. Types: recruiter, assessment, coding, system design, behavioral, hiring manager, final, other. Statuses: scheduled, completed, cancelled, no-show. A rescheduled round stays one row; the timeline keeps the old time. A scheduled round whose time has passed shows "Result needed". Recording a result (with optional topics asked / went well / to improve) is user reflection only; the reflection can be edited later, but a completed result is final. The stable round ID and instant/zone are enough for a future calendar sync; no external calendar IDs exist yet.

**InterviewPrepItem** is a small per-round checklist. `PREP` items are preparation; `GAP` items are weak areas exposed by an interview. Each may reference one owned LearningTopic, owned DsaProblem or DsaTopic, or stay free text. Nothing is copied, and linking never changes mastery, review dates or DSA attempts; the learning topic and DSA problem pages show read-only "Interview mentions".

**Action required vs waiting on company.** `actionOwner` is ME, COMPANY or NONE. ME means I owe the next step; COMPANY means I'm waiting (shown with days since last recorded activity). Silence never changes the stage or implies rejection. Needs attention (per open application, deterministic order): overdue follow-up (most overdue first) → scheduled interview awaiting a result → interview before the end of tomorrow → follow-up due today → my action with no date. A waiting application reaches attention only when its planned follow-up date arrives.

**TimeBlock vs JobApplication vs InterviewRound.** A JOB_SEARCH TimeBlock says _when_ I work on applications; a JobApplication is _which_ opportunity; an InterviewRound is _an interview event_. They are not linked or merged, and interviews never edit TimeBlocks. The weekly summary counts applications logged while a JOB_SEARCH actual session was running, by timestamp only.

`/jobs` shows needs attention, upcoming interviews, a stage-grouped pipeline with search/view/stage/focus/source filters, quick add, the next job-search block, factual week-to-date counts (no scores) and reminder preferences. `/jobs/[id]` holds next action, interviews with prep and reflections, the timeline, stage changes, contacts, notes and offer notes. Today shows a prominent Today's interview section (application, prep and meeting links) and a compact Job search summary.

**Notifications** reuse inbox preferences: `JOB_FOLLOW_UP` creates one reminder per application per planned follow-up date at or after the preferred local time (overdue dates are not repeated daily); `INTERVIEW` creates a reminder about 24 hours before and another inside the configurable short window (default 60 minutes for new owners), keyed by round + start instant + window so retries never duplicate and reschedules re-arm. Closed applications and disabled preferences produce nothing. Prep items have no deadlines, so there is no separate prep-due reminder; the 24-hour reminder states open prep items. No closed-app push or email.

Migration `20260924230000_job_pipeline` preserves all applications. Legacy applied/next-action instants become owner-calendar dates; a legacy `interviewAt` becomes one scheduled "Interview (imported)" round at the same instant. New columns default conservatively (action owner NONE, arrangement UNKNOWN, priority normal); no history is invented. New seed owners get fictional Amazon/Shopify/Company X/Northwind examples (example.com URLs); existing owners receive nothing new. See the [WI-005 handoff](docs/WI-005-HANDOFF.md) and [ADR-008](docs/architecture/decisions.md#adr-008--job-pipeline-timeline-rounds-and-action-ownership-wi-005).

## Time storage policy (WI-005.1)

CareerOS stores two kinds of time and never mixes them:

- **Instants** (`timestamptz`), for example `ActualSession.startedAt/endedAt`, `TimeBlock.plannedStart/End`, `InterviewRound.scheduledStart/End`, `JobActivity.occurredAt`, notification times and every `createdAt`/`updatedAt`. These are real moments. They are processed in **UTC database sessions** and converted to the owner's IANA zone only at the display/domain boundary (`America/Toronto` by default).
- **Owner-calendar dates** (`DATE`), for example `DailyPlan.date`, DSA `nextRevisionAt`, `LearningTopic.nextReviewDate`, `JobApplication.appliedAt/nextActionDate` and `Goal.targetDate`. These are calendar labels, not instants, and never become timestamps.

**Why the server timezone must not matter.** `@prisma/adapter-pg` sends a `Date` as its UTC wall clock without an offset and, when reading, discards the offset PostgreSQL returns. Both steps are exact only in a UTC session. `src/lib/database.ts` therefore adds `-c TimeZone=UTC` to every connection's startup options. The app, Prisma migrations (`prisma.config.ts`), seed, scripts and tests all use it; existing URL options are kept and the pin wins. At server start, `src/instrumentation.ts` checks `SHOW TimeZone` for the app session: a non-UTC session stops the server (writes would be wrong), while a non-UTC _server default_ only logs an audit reminder unless a repair is recorded. If a transaction-mode connection pooler drops startup options, set the database default to UTC (`ALTER DATABASE … SET TimeZone = 'UTC'`); the startup check catches the mistake.

**DST.** Instants are absolute, so daylight-saving changes affect only how times are shown. Wall-clock input is converted with the IANA rules for its own date (`localInstant`), and nonexistent spring-forward times are rejected. Migrations that turn instants into dates name the zone explicitly (`AT TIME ZONE u.timezone`) and never rely on the session zone.

## Legacy local database repair

**Who may be affected:** databases used by CareerOS **before WI-005.1** on a PostgreSQL server whose `TimeZone` was not UTC. Homebrew/local installs usually inherit the machine zone. Every app-written instant there is stored shifted by that zone's offset (DST-dependent), even though the old app displayed it correctly. **Not affected:** CI, databases created by WI-005.1 or later, and servers that always ran in UTC (typical hosted PostgreSQL).

1. **Stop the app and back up the database** (`pg_dump --format=custom`), then check that the backup restores. A git tag is a source checkpoint, **not a database backup**.
2. `pnpm timestamps:audit` (read-only) reports the server default and app session zones, whether a repair is already recorded, per-table counts of instant values, DST-ambiguous rows, ID/timestamp samples with their would-be repaired values, and evidence such as future `createdAt` values. It prints only host/database names, IDs and timestamps: no credentials, notes or contacts. A single value cannot prove it was shifted; rows written by SQL itself (for example migration backfills) were not.
3. `LEGACY_TIMESTAMP_TIMEZONE=America/Toronto pnpm timestamps:repair` is a **dry run by default**. It performs the whole repair in one transaction, checks integrity, prints counts, then rolls back.
4. `pnpm timestamps:repair --legacy-zone=America/Toronto --apply --confirm=<database name>` commits. For each instant it computes `(value AT TIME ZONE legacy_zone) AT TIME ZONE 'UTC'`, which applies that date's own offset (DST-safe), under an advisory lock. It refuses when the legacy zone differs from the server default (unless `--force-zone`), when the zone is UTC, or when the confirmation doesn't match. It rolls back if row counts change or any start/end pair would invert. The `MaintenanceRecord` ledger row is written in the same transaction, and **any later repair is refused** (`--allow-repeat` is a developer-only override).
5. Run the repair **before** `pnpm db:deploy` for pending migrations, so that migrations converting instants to dates see correct values. The repair works on older schemas and creates the ledger table if needed.
6. Afterwards (or for any database created after WI-005.1) you may run `ALTER DATABASE <name> SET TimeZone = 'UTC'`. It changes nothing for pinned sessions and stops the startup reminder. Do **not** change it before auditing a legacy database, because the audit uses the server default as evidence.

Limits: a wall-clock value that fell in the zone's spring-forward gap cannot be told apart from the hour after it. Such rows are counted as ambiguous and kept at the later reading. Values that SQL wrote directly (`CURRENT_TIMESTAMP` backfills of `DailyPlan.generatedAt` and imported-row `updatedAt`) were never shifted and move by the offset. They are metadata or null-checks only. See [operations](docs/engineering/operations.md#legacy-timestamp-repair), [ADR-009](docs/architecture/decisions.md#adr-009--utc-database-sessions-and-guarded-legacy-timestamp-repair-wi-0051) and the [WI-005.1 handoff](docs/WI-005.1-HANDOFF.md).
