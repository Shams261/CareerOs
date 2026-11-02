# WI-134 handoff: retention

Date: 2026-11-02. From the full audit's privacy finding PR1 (`output/Silsila-Full-Audit.pdf`, page 6): inbox, session and AI-usage rows grew forever. No migration.

## What changed

- **`src/features/notifications/retention.ts`.**
  - `pruneRecords(now, userId?)` deletes system records past `RETENTION_DAYS` and returns counts:

    | Record            | Removed when                                                                                                                                                                                                                                   |
    | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `Session`         | 30 days after `expiresAt` or `revokedAt`                                                                                                                                                                                                       |
    | `NotificationLog` | 180 days after `scheduledFor`, and only once read. Never a `JOB_FOLLOW_UP`: its dedupe key holds a date that can stay overdue for months, so removing it would re-create the reminder. Never an unread row: it still shows in Needs attention. |
    | `AiUsage`         | after 400 days (the monthly limit reads only the current month)                                                                                                                                                                                |

  - `dailyRetention(now)` runs it at most once in 20 hours, recorded in `JobRun` as `retention`. It logs `[retention] pruned {sessions, reminders, aiUsage}` (counts only).
- **The reminder route** (`/api/notifications/process`) calls `dailyRetention()` with its daily checks (provider check, memory prune, learned line times), inside the same try, so a failure never fails the reminders.
- **The owner's records are never touched:** blocks, sessions of work, attempts, notes, reviews, applications, Rumi's conversations and memories (memories keep their own expiry, WI-100).
- **`/privacy`** ("Keeping and removing data") states the three periods; last updated 2 November 2026. `security.md` lists the new log line, and `operations.md` describes the job.

## Tests

`tests/retention-database.test.ts` builds rows on both sides of each line:

- sessions: an old expiry, an old revocation, a recent expiry, a live one;
- reminders: old read, old unread, old follow-up, recent read;
- AI usage: old and recent.

`pruneRecords` removes exactly the three old system rows, and a second run removes nothing. The test scopes `pruneRecords` to its own user, since the test database is shared by parallel test files.

## Owner note

The first daily run after the deploy deletes nothing on production unless there are rows older than these periods; Silsila has been live since 2026-10-20. To use different periods, change `RETENTION_DAYS`.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (150 files, 840 tests), build, `test:e2e` and `test:e2e:safari` (19 each), docs:check, `git diff --check`.
