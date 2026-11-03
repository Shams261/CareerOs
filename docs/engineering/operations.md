# Operations and release runbook

## Environments

Development uses `.env` (ignored) and a persistent Docker PostgreSQL volume or a configured local instance; `pnpm google:fake` provides sign-in without a Google client. CI uses a fresh PostgreSQL service with fictional seed data. Production follows the [deployment guide](deployment.md): one Node.js process behind HTTPS, managed PostgreSQL with TLS and backups, least-privilege credentials, a secret store and an external scheduler. Variables are listed in the [environment reference](environment.md); controls in [security](security.md).

A fresh local install follows the [README](../../README.md). An existing owner should run migrations and restart the app, not reseed to obtain feature changes. The seed inserts defaults only for a new owner and preserves existing routines.

## Release checklist

A release is a merge to `main`: Render builds and deploys it once every Quality check is green.

1. **Gate on the branch:** the full gate from [CONTRIBUTING](../../CONTRIBUTING.md#the-gate) passes locally, and for UI work the WebKit journeys too (`pnpm test:e2e:safari`, or Actions → WebKit → Run workflow). Then push the branch and wait for its Quality run to be green before merging (WI-138: Quality runs on `feat/**`, `fix/**` and `chore/**` pushes), so `main` never turns red.
2. **Backup first:** Actions → Backup → Run workflow, and wait for it to be green (dump, restore check, encrypted artifact). For a migration, also take and verify a local copy and apply the migration to the personal database before the merge, following the [checklist](backup-restore.md#migrating-an-existing-personal-database). A migration must be expand-only: the running code keeps working once it is applied.
3. **Merge and watch:** the Quality run on `main` turns green and Render deploys; `/api/health` reads `ok`, `UTC`, `current` and `"jobs":"ok"`, and its `schema` is current once a migration is in.
4. **Smoke-test:** sign-in works; Today, Plan and one non-destructive saved edit work; Settings → System status shows recent successes for the scheduled jobs.
5. **Look at the log** in Render for `[request] failed` or `action failed` lines in the first minutes. A line names a route, an error class and a reference; the owner sees the same reference on the screen.

Never use `db push` against production. `prisma migrate deploy` does not make a backup; destructive schema changes need a separate reviewed data migration and rollback plan.

## Scheduled jobs

| Job              | Endpoint (POST, `Authorization: Bearer $CRON_SECRET`) | Cadence        | Runtime (typical)            | On failure                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------- | -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reminders + push | `/api/notifications/process`                          | every minute   | < 1 s; bounded by 100 pushes | 500 and `JobRun.lastError` (error class only). Safe to retry or overlap: inbox rows are unique, push attempts are capped at 3. Study Nudges (WI-028) run in the same request. Once a day the same request also runs Grill Me's provider check (WI-031, `JobRun` `ai-provider-check`); its failure never fails the reminders.               |
| Calendar sync    | `/api/calendar/sync`                                  | every 5–15 min | seconds; per-owner lease     | Per-owner errors are recorded on the connection and retried with backoff; a busy lease is skipped, not queued. A run where every connection failed is recorded as a failed run (`JobRun.lastError` `SyncFailed`) while the endpoint still answers 200, so a broken connection turns the job stale on `/api/health` after an hour (WI-145). |

In production (ADR-014) the main caller is [cron-job.org](https://cron-job.org): free, per-minute schedules, custom request headers, a 30 s execution limit (both jobs finish in seconds) and failure notifications. The per-minute call is also what keeps a Render free instance (or a Heroku Eco dyno) from spinning down, so a silent cron outage shows up as a sleeping app and a stale "last success" in Settings. Any other caller gets 401. Each run records `lastStartedAt`, `lastSucceededAt`/`lastFailedAt` and a count summary in `JobRun`; Settings → System status shows "last success". If a job has not succeeded for longer than three of its intervals, check the scheduler's own log first (401 means a wrong secret, connection errors mean the app or TLS), then the app log. Missed minutes are not replayed as alerts, but inbox reminders still appear once processing resumes.

**Retention (WI-134).** Once a day the reminder request also prunes system records past their retention (`dailyRetention`, `src/features/notifications/retention.ts`, `JobRun` `retention`): sign-in sessions 30 days after expiry or revocation, read reminders 180 days after they were due (never a job follow-up, never an unread one), and AI usage rows after 400 days. It logs counts only and never touches the owner's own records.

**Second caller (WI-121; measured in WI-138).** `.github/workflows/scheduler.yml` asks GitHub Actions to call both endpoints every 15 minutes with the same bearer secret (the repository secret `CRON_SECRET`; without it the run only says so). GitHub does not keep that clock for this repository. Its schedules started every 3.5 to 8 hours (the hourly Uptime workflow, 2026-10-27 to 2026-11-02), and the Scheduler had no scheduled start at all in its first six hours (its one run was by hand). So it is a best-effort backstop that may run a few times a day, not a second clock. If cron-job.org stops, reminders and sync slow to GitHub's pace, and the external monitor below turns red within minutes because `jobs` goes `stale`. Both endpoints are safe to call twice, so the callers never conflict. A real second clock would need another always-on caller holding the secret, such as a second scheduler service; that is the owner's choice, since it hands the secret to one more party.

## Uptime and job alerts (WI-051)

`.github/workflows/uptime.yml` reads `https://usesilsila.me/api/health` every hour at minute 17. It tries three times, 30 seconds apart, so a free instance can wake. It fails unless `status` is `ok`, `schema` is `current` and `jobs` is `ok`, and a failed run is an email from GitHub to the owner.

`jobs` comes from `jobFreshness` (`src/server/health.ts`, `staleJobs` in `src/lib/job-health.ts`). A job is stale once it has gone three of its intervals without a success:

- reminders: 15 minutes;
- calendar sync: 60 minutes;
- the AI provider check: three days.

Reminders must always have run. The other two count only once they have run at least once.

The health check gives only `ok`, `stale` or `unknown`, never names or times, and the field never changes the status code, so the host does not restart a healthy app over a cron outage. When it reads `stale`, Settings → System status shows which job and when it last succeeded. Then check the scheduler first, as above. cron-job.org's own failure emails remain the first signal for the scheduler itself.

**External monitor (WI-121; set up by the owner on 2026-11-02).** GitHub runs the hourly check on a best-effort basis; in practice it ran every 3.5 to 8 hours (2026-10-27 to 2026-11-02). The real watch is Better Stack: an HTTP keyword monitor on `https://usesilsila.me/api/health` with the keyword `"jobs":"ok"`, every few minutes, alerting by email. It catches both an app outage and a stopped scheduler. The Uptime workflow stays as a second check.

## Backups and restoration

See [backup and restore](backup-restore.md) for the schedule, recovery, the recovery drill and the personal database migration checklist. Supabase Free (ADR-014) keeps no provider backups. The Backup workflow dumps, verifies and encrypts production every day (WI-121), so up to a day of writes can be lost (the recovery point). `pnpm db:backup` from a workstation (it needs `pg_dump` 17 or newer, `brew install libpq`) is for the copy before a migration. How long a recovery takes is measured by the drill (`scripts/restore-drill.sh`) and recorded there. Restores always go into a new scratch database, never over a live one. Do not commit backups.

## Roadmap material import (WI-012)

The five roadmaps (Backend engineering, System design, Technical mastery, DSA patterns, Behavioural and resume) are imported from the owner's study materials, never committed. Two steps, both run from the workstation:

1. **Build the bundle** from the folder that holds the two HTML trackers, `02_TECHNICAL_ROADMAP.md`, `LearningMaterialsPDF/DSA-PATTERN_BOOK.pdf` and the behavioural handbook PDF. Needs poppler's `pdftotext` (`brew install poppler`). The Sean Prashad problem list is fetched once from GitHub and cached as `leetcode-patterns.json` beside the sources (`PRASHAD_JSON=<path>` points at a local copy instead).

   ```sh
   pnpm roadmap:bundle "<sources folder>"
   ```

   Writes `roadmap-bundle.json` next to the sources and prints items per roadmap. Review it once by eye (it is plain JSON and may be edited); the bundle holds the owner's rehearsal text, so it stays outside the repository like a backup.

2. **Import** it for the single owner (the importer refuses when the database holds any other number of users):

   ```sh
   DATABASE_URL=<session-pooler url> DATABASE_SSL=no-verify pnpm roadmap:import "<sources folder>/roadmap-bundle.json"
   ```

   Idempotent: keyed by roadmap title, item slug, DSA topic name and problem URL. A re-run updates scope, checkpoint, priority, estimate, references, link, source, prompt template and scenarios, and never touches status, completion, "asked in interview", attempts, confidence, or an item's notes once the owner has written any (the report prints `notes_kept`). Items the owner adds by hand have no slug and are never touched. Re-run after editing a source or `scripts/lib/{dsa-curriculum,interview-research}.ts`.

3. **Publish** it as the default curriculum (WI-064, ADR-026), so every workspace gets it on its first sign-in and Settings can restore it:

   ```sh
   DATABASE_URL=<session-pooler url> DATABASE_SSL=no-verify pnpm curriculum:publish "<sources folder>/roadmap-bundle.json"
   ```

   Re-running replaces the stored bundle; workspaces keep their copies and gain new items through Settings → Restore default curriculum. Neither the import nor the copy creates a goal.

Before the first import on a workspace that already holds test data, run the reset in [backup and restore](backup-restore.md#reset-the-owners-domain-data).

## Legacy timestamp repair

For a database used before WI-005.1 on a non-UTC PostgreSQL server (see the README time storage policy). Never rehearse on the only copy.

1. Stop the app. Take a backup: `pg_dump --format=custom --file=careeros-pre-time-repair.dump`. Verify it by restoring into an isolated database.
2. `psql -c 'SHOW TimeZone'` gives the server default that old sessions used.
3. `pnpm timestamps:audit`. Record counts, ambiguous rows and samples.
   Before enabling Study Nudges or AI (Version 2), also run `DATABASE_URL=<personal> pnpm data:check`: read-only, it lists test- or UAT-named records by model and id (never their names) and exits 1 until they are cleaned up in the app.
4. `LEGACY_TIMESTAMP_TIMEZONE=<zone> pnpm timestamps:repair`. Review the dry-run counts and integrity output; nothing is written.
5. `pnpm timestamps:repair --legacy-zone=<zone> --apply --confirm=<database>`. This is transactional and writes a `MaintenanceRecord` ledger row.
6. `pnpm db:deploy` for any pending migrations. Their date conversions now see corrected instants.
7. Start the new app. Check that the audit shows the ledger, Today/calendar times match your routines, DSA attempts and interviews show expected local times, and the server log has no time warning.
8. If anything is wrong, stop and restore the step-1 backup into a new database. Do not run the repair again: the ledger refuses, and a repeat would shift correct values.

## Google Calendar (WI-006)

- **Configuration:** a Google Cloud OAuth _web application_ client whose authorized redirect URI is exactly `GOOGLE_OAUTH_REDIRECT_URI` (`https://<host>/api/calendar/oauth/callback`), with the Calendar API enabled. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `CALENDAR_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) in the deployment secret store; never commit them.
- **Scheduler:** `POST /api/calendar/sync` with `Authorization: Bearer $CRON_SECRET` every 5–15 minutes. Overlapping or repeated runs are safe.
- **Push (optional):** set `GOOGLE_CALENDAR_WEBHOOK_BASE_URL` to the public HTTPS origin. Channels renew during syncs, so the scheduler must keep running.
- **Key rotation:** changing the key makes stored tokens undecryptable, and the connection shows _Reconnect required_. Rotate by setting the new key, then reconnecting. Keep the old key until then if you want to revoke old tokens.
- **Incidents:** _Reconnect required_ means the token was revoked, permission removed or the key changed; reconnect. _Calendar missing_ means the CareerOS calendar was deleted in Google; reconnect creates a new one. Server logs record `[calendar]` events as IDs, codes and counts only.
- **Local development:** without HTTPS, push is off and manual/cron sync is used. Automated browser checks use `tests/support/fake-google-server.ts` through loopback-only endpoint overrides; never a real account.

## Common incidents

| Symptom                                   | First checks                                                                                      | Safe response                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grill Me says "unavailable"               | Settings → Data → Grill Me: the block reason and when the provider was checked; OpenRouter status | **Check the provider again**. If the endpoint left the ZDR list or its price rose, keep AI off and record a new decision in ADR-022 before changing `MODEL`/`ENDPOINT`. To stop AI at once, remove `OPENROUTER_API_KEY` or set `STUDY_AI_ENABLED=false` and redeploy; kept cards stay. |
| Database unavailable                      | Host/port, credentials, TLS, service health                                                       | Restore connectivity; do not reseed/reset a real database.                                                                                                                                                                                                                             |
| Migration rejects duplicate open sessions | Query open sessions per owner; inspect actual history                                             | Reconcile with the owner; do not arbitrarily delete sessions to satisfy the index.                                                                                                                                                                                                     |
| Session already running                   | Active-session banner on any day                                                                  | Stop/complete that session before starting another.                                                                                                                                                                                                                                    |
| Routine generation DST error              | Local date/time and zone                                                                          | Adjust nonexistent local time or add a deliberate dated block; retry generation safely.                                                                                                                                                                                                |
| Preview stale                             | Another tab changed routine/blocks                                                                | Reload and preview again; never bypass version checks.                                                                                                                                                                                                                                 |
| Reminders missing                         | Preferences, generated plans, cron auth/run history, eligibility                                  | Run protected processing with secure credentials; inspect inbox. Push is best-effort; see below.                                                                                                                                                                                       |
| Push not arriving on a device             | Settings device count, `[notifications] processed` counts, OS focus/battery settings              | Disable and re-enable that device in Settings; send a test. iOS needs the Home Screen app.                                                                                                                                                                                             |
| Cannot sign in                            | `/login?error=` code; `[auth] sign-in rejected <code>` log                                        | `not_owner`: wrong account. `owner_mismatch`: fix `OWNER_EMAIL`/stored email. `redirect_uri_mismatch` at Google: fix the client.                                                                                                                                                       |
| Server exits at start (code 1)            | Log `CareerOS configuration invalid:` then `- NAME: reason` lines                                 | Fix the named variables; values are never printed.                                                                                                                                                                                                                                     |
| Health `degraded`                         | `/api/health` fields                                                                              | `database` down: provider status; `sessionTimeZone` not UTC: set database default; `schema` behind: `pnpm db:deploy`.                                                                                                                                                                  |
| Secret leaked                             | Credential scope and exposure                                                                     | Rotate immediately, contain access, review logs, follow security policy.                                                                                                                                                                                                               |

## Rollback

Stop writes if integrity is at risk. Roll back the app only if the prior build supports the current schema. If not, deploy a forward fix or restore a backup into a new database and explicitly account for writes since that backup. Do not run `migrate reset`, delete volumes, or force-rewrite migration history on production. Escalate unresolved data reconciliation to the product owner.

## Measuring a page's queries

Every statement is a cross-region round trip in production (about 80 ms, app in Ohio, database in Canada Central), so the statement count of a page is its latency. Measure before adding queries to a page (WI-010, WI-061):

1. Turn on statement logging on a local, disposable PostgreSQL: `ALTER SYSTEM SET log_statement = 'all'; SELECT pg_reload_conf();` (Homebrew logs to `/opt/homebrew/var/log/postgresql@16.log`).
2. Build and start the app against a migrated database with example data: `pnpm build`, then `pnpm start` (never `pnpm dev`, which compiles on request).
3. Sign in through the fake provider (`pnpm google:fake`) and copy the session cookie.
4. Request one page with `curl -H "Cookie: careeros_session=…" http://localhost:3000/today`, note the log size before and after, and count the `statement` and `execute` lines in between. Repeat once to see the warm count (the snapshot cache keeps reads for three minutes).
5. Turn logging off again with `ALTER SYSTEM RESET log_statement; SELECT pg_reload_conf();`.

Record the counts (cold and warm) in the work item's handoff.

## Evidence still needed

Recorded since WI-008: the live host (Render and Supabase, ADR-014), health and job runs, a daily encrypted backup with a restore check in CI (WI-051, daily since WI-121) and push on two devices. Still open: a timed restore into a fresh project (the recovery time), real-user latency from production, an external monitor (below) and error tracking.
