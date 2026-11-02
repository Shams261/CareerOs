# WI-121 handoff: ops safety

Date: 2026-11-02. The second "Now" item of the full audit (`output/Silsila-Full-Audit.pdf`, pages 6 and 7): the cheap fixes for recovery, detection and a few small security notes. No migration, no screen changes.

## What changed

- **Daily backup.** `.github/workflows/backup.yml` runs at 07:23 UTC every day (it ran on Sundays). Each run still dumps, restore-checks, encrypts to the owner's age key and keeps 35 days. With Supabase Free keeping no backups, the most that can be lost falls from a week to a day.
- **A second scheduler.** `.github/workflows/scheduler.yml` calls `/api/notifications/process` and `/api/calendar/sync` every 15 minutes with the cron bearer, beside cron-job.org. It prints only status codes. It fails, and GitHub emails the owner, when an endpoint does not answer 200. Without the `CRON_SECRET` repository secret it says so and stops.
- **Statement timeout.** The app's pool sends `statement_timeout` 15 s (`STATEMENT_TIMEOUT_MS`, `createPgAdapter` in `src/lib/database.ts`). The roadmap import and the curriculum publish turn it off, and migrations and `pg_dump` never use this pool.
- **Google timeouts.** `requestWithRetry` gives every attempt `AbortSignal.timeout(10 s)` (`GOOGLE_TIMEOUT_MS`). A hung attempt counts as a network failure and is retried within the existing bound, so it can no longer hold the sync lease or the cron request.
- **Rate-limit key.** `clientIp` prefers `CF-Connecting-IP`, which Cloudflare at Render's edge sets and overwrites; the leftmost `X-Forwarded-For` is only the fallback.
- **Log hygiene.** The startup database check logs the error's name and code only (a connection error can carry host and user names).
- **`src/app/global-error.tsx`.** A root-layout failure shows Silsila's own page: inline light-theme styles, `role="alert"`, the digest, Try again (`retry`), a 44 px target. Next's unstyled default page no longer shows.
- **Rumi's stream.** If the tab closes mid-answer, `/api/rumi/ask` stops writing lines (`cancel`, guarded `enqueue`) but still finishes and stores the answer and its notes.
- **Docs.**
  - `backup-restore.md`: the schedule is daily.
  - `operations.md`: the second caller, and the external monitor as an owner step.
  - `security.md`: the rate-limit key.

- **A Monday-only test failure.** WI-120's merge failed CI's browser journeys on Monday 2026-11-02. On a Monday, Weekly review opens last week while that review is open (WI-013), so the "Later week" link exists, and the review journey had assumed it never does. The journey now follows › once when it is there, then checks that no link goes past this week. Product behaviour is unchanged. This merge also deploys WI-120.

## Tests

- `tests/calendar-domain.test.ts`: a hung attempt times out, is retried and is then refused; every attempt carries a signal.
- `tests/production-unit.test.ts`: `CF-Connecting-IP` wins over a client-written forwarded list, with the fallbacks.
- `tests/time-integrity.test.ts`: the app's pool reports `statement_timeout` = `15s`.

## Owner steps

1. **Add the repository secret `CRON_SECRET`** (GitHub → Settings → Secrets and variables → Actions). It is the same value as on Render and cron-job.org. Until it is set, the Scheduler workflow only prints a notice.
2. **Add an external monitor:** UptimeRobot or Better Stack (free), every 5 minutes, an HTTP keyword check on `https://usesilsila.me/api/health` for `"jobs":"ok"`, with email alerts. GitHub's hourly check really runs every few hours.
3. **Optional:** verified database TLS. Download the Supabase CA and add it to Render as a secret file. Set `DATABASE_SSL=verify-full` and `DATABASE_SSL_CA=<path>`; the app already supports both. Then do the same for `BACKUP_DATABASE_URL`'s run.
4. After the first daily run, Actions → Backup should show a green run with `Restore verified.`

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (146 files, 826 tests), build, `test:e2e` and `test:e2e:safari` (16 each, run on a Monday), docs:check, `git diff --check`. The new workflows run only on GitHub: the Scheduler on its first quarter hour after the secret is set, the Backup at 07:23 UTC.
