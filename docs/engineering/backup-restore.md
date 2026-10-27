# Backup, restore and personal database migration

The managed provider's automated backups and point-in-time recovery are the first line of defence. `pnpm db:backup` adds an independent copy you control. `pnpm db:restore:verify` proves a copy restores, without touching any existing database. Both need the PostgreSQL client tools (`pg_dump`, `pg_restore`) at the server's major version or newer.

## Commands

```sh
pnpm db:backup
# → backups/careeros-<UTC timestamp>.dump (custom format, no owner/ACL, file mode 600) and its SHA-256

pnpm db:restore:verify backups/careeros-<timestamp>.dump
# → restores into a NEW database careeros_restore_verify_<ms>, checks it, drops it

pnpm db:restore:verify <file> --keep   # keep the scratch database for inspection
```

- Credentials are passed to `pg_dump`/`pg_restore` through `PG*` environment variables, never on the command line, and are never printed. Output shows only host and database names.
- Only the `public` schema is dumped, and the dump recreates it, so the restore check drops the new scratch database's empty `public` schema before restoring. Every Silsila table and `_prisma_migrations` live there; a managed provider's own schemas and extensions (Supabase: `auth`, `storage`, `vault`, `graphql`) are not Silsila data and would not restore on another server.
- Client tools: a newer client than the server is fine, an older one is refused. On this workstation the Homebrew `postgresql@16` tools are first on the path, so prefix with `PATH=/opt/homebrew/opt/libpq/bin:$PATH` (libpq's `pg_dump`/`pg_restore` 18). A dump written by a 17+ client restores only on a 17+ server, so verify against the repo's Docker PostgreSQL 17 (`DB_PORT=5433 docker compose up -d db`, then `RESTORE_VERIFY_SERVER_URL=postgresql://careeros:careeros@127.0.0.1:5433/careeros`), not the local 16.
- `BACKUP_DIR` changes the output directory. `backups/` is git-ignored. Move copies to encrypted storage you control (an encrypted disk or a bucket with server-side encryption and restricted access). A dump contains every personal record.
- Restore verification creates its scratch database on `RESTORE_VERIFY_SERVER_URL` (default: the `DATABASE_URL` server). The role needs `CREATEDB`; managed application roles often lack it, so point this at a local PostgreSQL instead. It **refuses** if the scratch name exists or equals the configured database, restores with `--no-owner --no-acl --exit-on-error`, prints the dump's latest applied migration beside the one this code expects, row counts for the main tables and the newest block's creation time (the recovered data age), fails if no user was restored, and drops the scratch database unless `--keep`.
- It never restores over a live database. Real recovery is a deliberate operator action (below).

## Schedule

| When                       | What                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ |
| Daily (provider)           | Automated backups with at least 7 days of retention; PITR where offered        |
| Weekly (automated, WI-051) | The Backup workflow: dump, restore check, encrypted artifact kept 35 days      |
| **Before every migration** | `pnpm db:backup`, then `pnpm db:restore:verify <file>`; keep the last 4 copies |
| Monthly                    | Time a full restore verification and record duration and data age (NFR-004)    |

## Weekly automated backup (WI-051)

`.github/workflows/backup.yml` runs every Sunday at 07:23 UTC, and on demand from Actions → Backup → Run workflow. It:

1. dumps production with `pnpm db:backup`;
2. proves the dump with `pnpm db:restore:verify` against a scratch PostgreSQL 17 service, and fails unless it prints `Restore verified.`;
3. encrypts the dump with [age](https://age-encryption.org) to the owner's public key, shreds the plain file, and keeps `silsila-backup-<run>` as an artifact for 35 days.

The repository is public, so anyone signed in to GitHub can download an artifact. That is why only ciphertext is ever uploaded: the private key never leaves the owner's workstation. A failed run is an email from GitHub to the owner.

**One-time setup (the owner, never in chat or in the repository):**

1. Install age: `brew install age`.
2. Make a key pair: `mkdir -p ~/.config/silsila && age-keygen -o ~/.config/silsila/backup-key.txt`. It prints `Public key: age1…`. Keep the key file, and a copy in a password manager. Without it no backup can be opened.
3. On GitHub, open Shams261/CareerOs → Settings → Secrets and variables → Actions, and add two repository secrets:
   - `BACKUP_DATABASE_URL`: the Supabase session-pooler URL;
   - `BACKUP_AGE_RECIPIENT`: the `age1…` public key.
4. Run Actions → Backup → Run workflow once and check it is green.

**Opening a backup:**

1. Download the artifact zip from the run and unzip it.
2. Decrypt: `age --decrypt -i ~/.config/silsila/backup-key.txt -o careeros.dump careeros-<timestamp>.dump.age`.
3. Verify it, as above (Docker PostgreSQL 17 and the libpq `PATH`): `PATH=/opt/homebrew/opt/libpq/bin:$PATH RESTORE_VERIFY_SERVER_URL=postgresql://careeros:careeros@127.0.0.1:5433/careeros pnpm db:restore:verify careeros.dump`.

GitHub pauses scheduled workflows in a public repository after 60 days without activity. A push re-enables them, and so does the Run workflow button.

## Recovering from a bad state

1. Stop the app and the scheduler.
2. Restore the chosen dump into a **new** database: `createdb careeros_recovered && pg_restore --no-owner --no-acl --exit-on-error --dbname careeros_recovered <file>`.
3. Check it (`pnpm db:restore:verify` output, a few known records).
4. Point `DATABASE_URL` at the recovered database, start the app, run the smoke test. Keep the damaged database until you are sure nothing else is needed from it.
5. Writes made after the backup are lost unless recovered separately; decide explicitly.

## Reset the owner's domain data

For the one-time clean-out of a workspace that holds only acceptance-test data, before real use (WI-012). `scripts/reset-owner-data.sql` deletes, in one transaction, every record the owner authored (plans, blocks, sessions, check-ins, routines, practice problems and attempts, learning subjects and topics, applications and rounds, roadmaps, notes, reviews, reminders, sync conflicts) and the shared DSA topic list. It keeps the `User` row, sign-in sessions, notification preferences, push devices, the Google Calendar connection and watch channel, job runs, maintenance records and the migration history. It refuses to run unless the database holds exactly one `User`.

1. **Back up and verify** (above): `PATH=/opt/homebrew/opt/libpq/bin:$PATH pnpm db:backup`, then `db:restore:verify` on the Docker PostgreSQL 17. Do not continue without `Restore verified.`
2. **Clear Google first.** In the app, Plan → remove the test routine (preview, confirm) and cancel any remaining test blocks, then Settings → Sync now, so the dedicated Google calendar loses its events through sync. The script deletes blocks without talking to Google.
3. **Run the script** against the session-pooler URL:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/reset-owner-data.sql
   ```

   It prints a count per table; every domain table must read 0 and the kept tables keep their rows. Any error rolls the whole transaction back.

4. **Check the app**: `/today` opens with the Start here card; Settings → System status is healthy; you are still signed in.
5. Continue with the roadmap import in [operations](operations.md#roadmap-material-import-wi-012).

## Fresh start, keeping the curriculum (WI-045)

For a workspace that holds only test and acceptance data but already has the imported roadmaps and practice problems. `scripts/fresh-start.sql` is the newer, narrower reset; `reset-owner-data.sql` above also deletes the curriculum.

It deletes, in one transaction:

- everything the owner did: routines, plans, blocks, sessions, check-ins, reviews and priorities, notes to self, inbox reminders, sync conflicts;
- applications with their rounds, prep items, activity and prep docs;
- practice attempts, learning activity, revision cards;
- Ask Rumi conversations, "Rumi knows" lines, "Rumi noticed" answers;
- every roadmap, item, problem, topic and goal named as test data (the `isTestNamed` rule, mirrored in SQL and checked against it in `tests/fresh-start-script.test.ts`).

It resets the rest of the curriculum to zero: items Not started with no revision, "asked" or note; problems unattempted and Red; learning topics at zero mastery. Imported scope, "done when", references and slugs stay, so a later `roadmap:import` still matches.

It keeps the `User` row and sessions, push devices, notification preferences, Study nudges and AI settings, the AI cost ledger (the monthly stop keeps counting), the Google Calendar connection, job runs, maintenance records and the migration history. It refuses unless the database holds exactly one `User`, and running it twice is harmless.

1. **Back up and verify** as above. Do not continue without `Restore verified.` Run `db:restore:verify` with the same `PATH=/opt/homebrew/opt/libpq/bin:$PATH` as the backup: a dump from the libpq `pg_dump` 18 is unreadable to Homebrew's `pg_restore` 16 ("unsupported version (1.16) in file header").
2. **Clear Google first.** Plan → Routines → turn the test routine off and confirm the preview (its future blocks are cancelled), then Settings → Sync now. Past test events stay in the dedicated Silsila calendar; delete them there if you like. The script never talks to Google.
3. **Run the script:**

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/fresh-start.sql
   ```

   The last table must read 0 for routines, blocks, sessions, applications, attempts, conversations, roadmap items done and test-named left, and show the roadmaps, items and problems kept.

4. **Check:** `pnpm data:check` reports nothing; `/today` opens empty with the first-routine card.

## Migrating an existing personal database

For the owner's existing database (created before WI-008, possibly before WI-005.1). **Nothing here runs automatically, and no automated test or verification touched this database.** Do it in a quiet window; it takes a few minutes.

1. **Stop** the app and any scheduler that points at the database.
2. **Back up**: `DATABASE_URL=<personal> pnpm db:backup`.
3. **Verify the backup**: `RESTORE_VERIFY_SERVER_URL=<local server> pnpm db:restore:verify <file>`. Do not continue unless it prints `Restore verified.`
4. **Server time zone**: `psql "<personal url>" -c 'SHOW TimeZone'`. Note the result.
5. **Audit**: `DATABASE_URL=<personal> pnpm timestamps:audit` (read-only). If the server zone is not UTC and CareerOS wrote data there before WI-005.1, continue with 6; otherwise go to 8.
6. **Dry run**: `DATABASE_URL=<personal> LEGACY_TIMESTAMP_TIMEZONE=<zone from step 4> pnpm timestamps:repair`. Review counts and integrity output; nothing is written.
7. **Apply** (only if the dry run looks right): `DATABASE_URL=<personal> pnpm timestamps:repair --legacy-zone=<zone> --apply --confirm=<database name>`.
8. **Migrate**: `DATABASE_URL=<personal> pnpm db:deploy`.
9. **Owner email**: `psql "<personal url>" -c 'SELECT id, email FROM "User"'`. The stored email must be the Google account you will sign in with. If it isn't (for example a seed owner), either set `OWNER_EMAIL` to the stored address when it is your Google address, or update the row: `UPDATE "User" SET email = '<google email>' WHERE id = '<id>'`. Sign-in refuses to create a second, empty workspace (`owner_mismatch`) rather than guessing.
10. **Configure**: remove `APP_PASSWORD`; add `APP_BASE_URL`, `AUTH_SECRET`, the Google client and optional VAPID keys ([environment reference](environment.md)).
11. **Start and verify**: `/api/health` is `ok / UTC / current`; sign in; Today shows your routines at the expected local times; a past session, a DSA attempt and an interview show the expected times; Settings → System status is healthy; the server log has no time warning.
12. If anything is wrong: stop, and restore the step-2 backup into a new database (above). Do not run the repair a second time.

The upgrade migration `20260928090000_production_launch` only adds tables and columns. It marks existing reminders as already attempted (`pushAttempts = 3`) so that no backlog is pushed to a newly enabled device.
