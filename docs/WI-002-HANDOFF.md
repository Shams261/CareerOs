# WI-002 engineering handoff

Implemented the schedule engine and daily execution on top of WI-001. WI-003 has not started.

## Supported flows

- Navigate past/future weeks and any dated plan; add ad-hoc blocks and edit/reschedule individual occurrences without altering the routine.
- Create multi-weekday recurring routines; edit title, custom category, times, goal, notes, priority; pause, re-enable, or delete.
- Generate a selected day or seven days idempotently. Opening Today automatically ensures today's routine snapshot exists.
- Edit the routine only, or preview and explicitly apply changes to eligible future generated instances. Preserve daily overrides and recorded/completed work.
- Start, stop, resume, complete, skip with a reason, cancel, reset, and log manual actual sessions.
- Show an active session across days/reloads, plus current/next blocks, overdue/unrecorded status, planned/actual focus minutes, and block counts.
- Save a short daily review with notes, blocker, carry-forward, and optional rating.

## Architecture and schema

The existing Server Component / Server Action / Prisma architecture remains. Interactive forms add pending/error/success feedback without storing durable data in the browser. Server services own scheduling and execution rules. No new runtime dependencies were introduced.

`RoutineBlock → DailyPlan → TimeBlock → ActualSession` remains the core model. Routine weekdays are now an array; routines gain description/priority. Plans gain `generatedAt`; blocks gain original occurrence date, override marker, and skip reason; check-ins gain carry-forward text. Calendar reference fields are preserved.

Migration: `prisma/migrations/20260923200000_daily_execution/migration.sql`.

The migration converts old weekday values, retains all existing data, marks old plans as generated snapshots, and conservatively protects all legacy blocks as overrides. A partial PostgreSQL unique index rejects multiple open sessions per user. Existing duplicate open sessions intentionally cause migration failure instead of being silently discarded.

## Generation, overrides, and actual time

Generation locks the user row and commits one local day transactionally. A generated day is a snapshot. `(routineKey, occurrenceDate)` preserves a generated occurrence's original identity even after rescheduling, preventing recreation at its old time. Cancelled rows are retained as history/tombstones.

Routine propagation is opt-in. The server previews changes and checks a fingerprint and record versions at confirmation; changed inputs/data require another preview. Past starts, daily overrides, sessions, completed/skipped work are excluded. Routine deletion preserves dated history by default. Newly created routines can be applied to existing generated days through their edit form.

Actual sessions never overwrite planned times. Start/end use server time; manual logging validates dates, ordering, future endpoints and overlaps. Application writes share a per-user lock; the database independently enforces a single open session. Completed-session overlap prevention is application-level and must also be respected by direct database writers. Duration remains derived. Completing without a running session does not fabricate actual work.

## Notifications

The existing protected cron endpoint and persistent inbox remain. Reminder processing uses the same user lock as review/execution. Upcoming/overdue reminders only target planned blocks without sessions; progress/status/time edits dismiss obsolete unread block reminders. Date-boundary windows and occurrence keys prevent missed midnight cases and repeated inserts. Review submission dismisses unread reminders for that date.

Closed-app Web Push remains unsupported. No fake background delivery was added. The UI's minute/focus refresh only updates visible idle-page data; it does not schedule notifications.

## Important files

- `src/features/schedule/{domain,service,editing,actions,forms}.ts(x)`
- `src/features/execution/{service,refresh}.ts(x)`
- `src/components/action-form.tsx`
- `src/app/{today,calendar,review}/page.tsx`, shell and shared CSS
- `src/features/notifications/{domain,service}.ts`
- `prisma/schema.prisma`, new migration, and `prisma/seed.ts`
- `tests/execution-domain.test.ts`, `tests/execution-database.test.ts`
- `README.md`

## Validation

| Check                                             | Result                                    |
| ------------------------------------------------- | ----------------------------------------- |
| `pnpm lint`                                       | Passed, no warnings                       |
| `pnpm typecheck`                                  | Passed                                    |
| `pnpm test` with `TEST_DATABASE_URL`              | 50 passed across four files               |
| `pnpm build`                                      | Passed using the existing webpack builder |
| Migration on existing WI-001 development database | Passed                                    |
| Clean installation with both migrations           | Passed                                    |
| Seed run twice on isolated database               | Passed                                    |
| Desktop and mobile browser checks                 | Passed                                    |

Tests cover generation, timezone/DST handling, current/next/previous calculations, conflicts including overnight/week wraparound, actual duration, concurrent session starts, the database running-session constraint, stop/resume/complete, skip/cancel, manual-time validation, stale edits, template pause/re-enable/delete, propagation previews, protected overrides, owner scoping, and reminder deduplication/suppression.

Browser checks covered Start → reload → Complete; Skip with reason; cross-date Reschedule preserving actual sessions; manual actual entry; review/rating persistence; multi-weekday routine creation; repeated week generation without duplicates; routine propagation preview preserving a customized Wednesday; all seven routes at mobile width; private-page and cron authentication. No browser runtime errors or horizontal overflow were observed. Test-script selectors were corrected during verification; those were not application failures.

Commands executed included Prisma format/generate, `pnpm db:deploy`, `pnpm db:seed` twice, Prettier, all four required validation commands, isolated PostgreSQL integration tests, automated Chromium smoke scripts, and `git diff --check` / `git diff --stat`. Browser smoke scripts and screenshots are in `/private/tmp/careeros-wi002-*`; they use the bundled verification runtime rather than adding a browser dependency to the product.

## Limitations and technical debt

- The local `.env` still points to the earlier temporary PostgreSQL development cluster. Configure the documented persistent Docker volume or managed database before entering important personal data.
- No Google Calendar sync, complex recurrence, drag-and-drop, AI scheduling, or closed-app push.
- Existing owners keep their saved routines when seed runs. The new example weekly schedule is installed only for a newly seeded owner.
- Ambiguous Toronto fall-back local times choose the earlier occurrence. The later repeated-hour selector and correction/deletion of closed actual sessions remain future work.
- Custom study categories count as focus by default; Work/Gym/Personal do not. This is not yet user-configurable.
- Routine scope is “ungenerated days,” not an effective-from-date versioned schedule. Historical dates explicitly generated later use the then-current template.
- Seven-day generation is atomic per day, not across the whole batch. Failed dates can be retried safely.
- Large future propagation scans run in one transaction; pagination/batching may be appropriate if the planning horizon grows substantially.
- Existing minimal Basic Auth, TypeScript/ESLint compatibility pins and webpack build remain inherited WI-001 decisions.

Before WI-003, review those policies, durable hosting/backups, HTTPS/access controls, and deployment cron setup. No product data is held solely in server memory or localStorage.

## Run locally

After stopping your previous dev server with Ctrl+C:

```sh
conda activate webdev_env
pnpm db:generate
pnpm db:deploy
pnpm dev --port 3001
```

Open `http://localhost:3001/calendar` to configure your week and `http://localhost:3001/today` to execute your day. Existing `.env` credentials still apply. No reseed is required for an existing workspace.

Suggested commit: `feat: add editable weekly planning and daily execution`.

The repository had no baseline commit and WI-001 was already uncommitted, so the final `git diff --stat` includes the combined foundation and WI-002 files rather than an isolated WI-002 commit diff.
