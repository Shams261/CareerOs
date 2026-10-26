# Operations and release runbook

## Environments

Development uses `.env` (ignored) and a persistent Docker PostgreSQL volume or a configured local instance; `pnpm google:fake` provides sign-in without a Google client. CI uses a fresh PostgreSQL service with fictional seed data. Production follows the [deployment guide](deployment.md): one Node.js process behind HTTPS, managed PostgreSQL with TLS and backups, least-privilege credentials, a secret store and an external scheduler. Variables are listed in the [environment reference](environment.md); controls in [security](security.md).

A fresh local install follows the [README](../../README.md). An existing owner should run migrations and restart the app, not reseed to obtain feature changes. The seed inserts defaults only for a new owner and preserves existing routines.

## Release checklist

1. Link delivered stories and changed ADR/NFR entries in the release PR; verify CI and relevant browser evidence.
2. Take a backup and verify it (`pnpm db:backup`, then `pnpm db:restore:verify <file>`), see [backup and restore](backup-restore.md). Record the current app commit and migration status.
3. Build from the lockfile with validated environment configuration. Do not use example passwords in production.
4. Review migration SQL for compatibility with the currently running app. These early migrations may require a maintenance window; no zero-downtime guarantee is made.
5. Run `pnpm db:deploy` against the intended database, then start the matching app build (`pnpm start`). Never use `db push` as the production migration strategy.
6. Smoke-test: `/api/health` is `ok`/`UTC`/`current`; anonymous pages redirect to `/login` and APIs return 401; owner sign-in works; Today, Calendar and a non-destructive saved edit work; the scheduler endpoints reject a missing bearer.
7. Confirm the [scheduled jobs](#scheduled-jobs) run (Settings → System status shows recent successes). Alert on repeated failures or missing runs.
8. Record commit, migrations, operator, time, environment and results. Observe errors and latency before closing the release.

`prisma migrate deploy` does not make a backup. Destructive schema changes need a separate reviewed data migration and rollback plan.

## Scheduled jobs

| Job              | Endpoint (POST, `Authorization: Bearer $CRON_SECRET`) | Cadence        | Runtime (typical)            | On failure                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------- | -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reminders + push | `/api/notifications/process`                          | every minute   | < 1 s; bounded by 100 pushes | 500 and `JobRun.lastError` (error class only). Safe to retry or overlap: inbox rows are unique, push attempts are capped at 3. Study Nudges (WI-028) run in the same request. Once a day the same request also runs Grill Me's provider check (WI-031, `JobRun` `ai-provider-check`); its failure never fails the reminders. |
| Calendar sync    | `/api/calendar/sync`                                  | every 5–15 min | seconds; per-owner lease     | Per-owner errors are recorded on the connection and retried with backoff; a busy lease is skipped, not queued.                                                                                                                                                                                                               |

In production (ADR-014; also the Heroku alternative) the caller is [cron-job.org](https://cron-job.org): free, per-minute schedules, custom request headers, a 30 s execution limit (both jobs finish in seconds) and failure notifications. The per-minute call is also what keeps a Render free instance (or a Heroku Eco dyno) from spinning down, so a silent cron outage shows up as a sleeping app and a stale "last success" in Settings. Any other caller gets 401. Each run records `lastStartedAt`, `lastSucceededAt`/`lastFailedAt` and a count summary in `JobRun`; Settings → System status shows "last success". If a job has not succeeded for longer than three of its intervals, check the scheduler's own log first (401 means a wrong secret, connection errors mean the app or TLS), then the app log. Missed minutes are not replayed as alerts, but inbox reminders still appear once processing resumes.

## Backups and restoration

See [backup and restore](backup-restore.md) for `pnpm db:backup`, `pnpm db:restore:verify`, the schedule, recovery and the personal database migration checklist. Supabase Free (ADR-014) has no automated backups: `pnpm db:backup` from a workstation against the session-pooler URL, weekly and before every migration, is the only copy; it needs `pg_dump` 17 or newer (`brew install libpq`). On the Heroku alternative, `heroku pg:backups:capture` adds a provider-side snapshot. Proposed RPO/RTO are in the NFR register. Restore rehearsals always go into a new scratch database, never over a live one. Do not commit backups.

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

## Evidence still needed

WI-008 provides the procedures and tooling (health, job runs, backups with restore verification, security headers, sanitized logs, local accessibility and timing checks). The hosted environment itself, real backup retention and timed restores, TLS/ingress checks on the real host, external uptime/cron-freshness alerting, real-device push checks and load measurements remain to be recorded after deployment. This runbook does not establish that those controls have been deployed.
