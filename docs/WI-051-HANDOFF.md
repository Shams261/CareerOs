# WI-051 handoff — weekly backup and uptime alerts

Date: 2026-10-28. Branch `feat/wi-051-backups-alerts` from `main` `aab2fa6` (WI-050). This is the next P1 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, sections 8 and 11: "Backups are manual; a lost free database means lost history", "no alerting on job failure").

Supabase Free keeps no backups, and the only copy so far was a workstation `pnpm db:backup`. No migration.

## What changed

**Weekly backup** (`.github/workflows/backup.yml`). It runs every Sunday at 07:23 UTC, and on demand. In order:

1. Refuse to run without `BACKUP_DATABASE_URL` and an `age1…` `BACKUP_AGE_RECIPIENT`. Both are repository secrets that the owner sets.
2. Install the PostgreSQL 17 client and age from PGDG and Ubuntu.
3. `pnpm db:backup` against production (`DATABASE_SSL=no-verify`, as on the workstation).
4. `pnpm db:restore:verify` into a scratch database on a `postgres:17` service. The run fails unless it prints `Restore verified.`
5. Encrypt with `age --recipient` and shred the plain dump.
6. Upload `silsila-backup-<run>` (only the `.age` file) with `actions/upload-artifact` pinned to v7.0.2, kept for 35 days.

**Why encrypted.** The repository is public, so any signed-in GitHub user can download an artifact. Only ciphertext is uploaded, and the private key never leaves the owner's workstation. No secret appears in logs: `pgEnv` passes the password through `PGPASSWORD`, and `describeDatabase` prints only the host.

**Hourly uptime** (`.github/workflows/uptime.yml`, minute 17):

- `curl` reads `/api/health` up to three times, 30 seconds apart, so a sleeping free instance can wake.
- The run fails unless `status` is `ok`, `schema` is `current` and `jobs` is `ok`.
- No secret is used.
- A failed scheduled run is GitHub's email to the owner.

**Job freshness:**

- `staleJobs` (`src/lib/job-health.ts`, pure) uses three intervals per job:

  | Job                 | Stale after |
  | ------------------- | ----------- |
  | `notifications`     | 15 minutes  |
  | `calendar-sync`     | 60 minutes  |
  | `ai-provider-check` | 3 days      |

  Reminders must always have run. Calendar sync and the AI check count only once they have run, since they need a connection or a key.

- `jobFreshness` (`src/server/health.ts`) returns `ok`, `stale` or `unknown`. `/api/health` adds it as `jobs`, with no job names or times.
- `healthCheck` and the status code are unchanged, so a cron outage never makes Render restart a healthy app, and the existing health test still holds.

**Docs:**

- `backup-restore.md`: the Weekly automated backup section, with the owner's one-time setup and how to open a backup, plus the schedule table.
- `operations.md`: Uptime and job alerts. "External uptime/cron-freshness alerting" is removed from the evidence still needed.
- `CLAUDE.md`: the new security rule.

## Tests

| File                                | Tests | Covers                                                                                                              |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `tests/job-health.test.ts`          | 2     | reminders required; the others only once run; three intervals; a job that never succeeded; unknown jobs not watched |
| `tests/job-health-database.test.ts` | 1     | `jobFreshness` reads `ok` now and `stale` 20 minutes later; the shared `notifications` row is restored afterwards   |

Both workflow files parse as YAML. The live health check already answers `status: ok` and `schema: current`. It will carry `jobs` once this is deployed.

The backup workflow cannot run before the owner adds the secrets. It was not run from this branch. Its first run is the owner's step 4 below.

## Owner steps

The full steps are in `docs/engineering/backup-restore.md` → Weekly automated backup. Never paste the URL or the key in chat.

1. `brew install age`.
2. Create the key pair:

   ```sh
   mkdir -p ~/.config/silsila && age-keygen -o ~/.config/silsila/backup-key.txt
   ```

   Copy the `age1…` public key it prints, and keep the key file safe. A copy in a password manager is wise.

3. On GitHub, go to Shams261/CareerOs → Settings → Secrets and variables → Actions → New repository secret. Add two secrets:
   - `BACKUP_DATABASE_URL`: the Supabase URL;
   - `BACKUP_AGE_RECIPIENT`: the public key.
4. Go to Actions → Backup → Run workflow, then check that the run is green and has an artifact.
5. Actions → Uptime → Run workflow once after the deploy. It should be green.

## Gate

Lint, typecheck, build and docs check (89 files) pass on an export of the working tree; `pnpm test:ci`: 97 files, 554 tests; `git diff --check` clean.
