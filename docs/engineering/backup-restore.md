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
- `BACKUP_DIR` changes the output directory. `backups/` is git-ignored. Move copies to encrypted storage you control (an encrypted disk or a bucket with server-side encryption and restricted access). A dump contains every personal record.
- Restore verification creates its scratch database on `RESTORE_VERIFY_SERVER_URL` (default: the `DATABASE_URL` server). The role needs `CREATEDB`; managed application roles often lack it, so point this at a local PostgreSQL instead. It **refuses** if the scratch name exists or equals the configured database, restores with `--no-owner --no-acl --exit-on-error`, prints the dump's latest applied migration beside the one this code expects, row counts for the main tables and the newest block's creation time (the recovered data age), fails if no user was restored, and drops the scratch database unless `--keep`.
- It never restores over a live database. Real recovery is a deliberate operator action (below).

## Schedule

| When                                  | What                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| Daily (provider)                      | Automated backups with at least 7 days of retention; PITR where offered               |
| Weekly and **before every migration** | `pnpm db:backup`, then `pnpm db:restore:verify <file>`; keep the last 4 weekly copies |
| Monthly                               | Time a full restore verification and record duration and data age (NFR-004)           |

## Recovering from a bad state

1. Stop the app and the scheduler.
2. Restore the chosen dump into a **new** database: `createdb careeros_recovered && pg_restore --no-owner --no-acl --exit-on-error --dbname careeros_recovered <file>`.
3. Check it (`pnpm db:restore:verify` output, a few known records).
4. Point `DATABASE_URL` at the recovered database, start the app, run the smoke test. Keep the damaged database until you are sure nothing else is needed from it.
5. Writes made after the backup are lost unless recovered separately; decide explicitly.

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
