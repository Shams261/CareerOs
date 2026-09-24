# Operations and release runbook

## Environments

Development uses `.env` (ignored) and a persistent Docker PostgreSQL volume or a configured local instance. CI uses a fresh PostgreSQL service with fictional seed data. Production must use independently durable PostgreSQL, TLS, least-privilege credentials and a deployment secret store. The temporary `/private/tmp` database used during WI verification is not the production/development storage recommendation.

A fresh local install follows the [README](../../README.md). An existing owner should run migrations and restart the app, not reseed to obtain feature changes. The seed inserts defaults only for a new owner and preserves existing routines.

## Release checklist

1. Link delivered stories and changed ADR/NFR entries in the release PR; verify CI and relevant browser evidence.
2. Confirm backup freshness and a recent restore rehearsal. Record the current app commit and migration status.
3. Build from the lockfile with validated environment configuration. Do not use example passwords in production.
4. Review migration SQL for compatibility with the currently running app. These early migrations may require a maintenance window; no zero-downtime guarantee is made.
5. Run `pnpm db:deploy` against the intended database, then start the matching app build (`pnpm start`). Never use `db push` as the production migration strategy.
6. Smoke-test authentication, Today, Calendar, a non-destructive saved edit and scheduler authorization using controlled data.
7. Configure the external scheduler to POST `/api/notifications/process` every minute with the cron bearer secret from secure configuration. Alert on repeated failures or missing runs.
8. Record commit, migrations, operator, time, environment and results. Observe errors and latency before closing the release.

`prisma migrate deploy` does not make a backup. Destructive schema changes need a separate reviewed data migration and rollback plan.

## Backups and restoration

Configure automated encrypted backups and retention with the selected provider. Initial proposed RPO/RTO are in the NFR register, not achieved promises. Use operator-configured `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, TLS options and a secure password mechanism; do not put production passwords into shared shell history.

Example manual backup (choose an approved secure destination):

```sh
pg_dump --format=custom --file=careeros-backup.dump
```

Restore **only into a new isolated empty database**, never over the live database for a rehearsal:

```sh
pg_restore --no-owner --no-acl --dbname=careeros_restore_test careeros-backup.dump
```

Check migration history, owner/plan/session counts and representative timestamps, then start an isolated app against the restore. Record recovery duration and the age of recovered data. Restrict and securely dispose of rehearsal copies according to the chosen retention policy. Do not commit backups.

## Common incidents

| Symptom                                   | First checks                                                     | Safe response                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Database unavailable                      | Host/port, credentials, TLS, service health                      | Restore connectivity; do not reseed/reset a real database.                                          |
| Migration rejects duplicate open sessions | Query open sessions per owner; inspect actual history            | Reconcile with the owner; do not arbitrarily delete sessions to satisfy the index.                  |
| Session already running                   | Active-session banner on any day                                 | Stop/complete that session before starting another.                                                 |
| Routine generation DST error              | Local date/time and zone                                         | Adjust nonexistent local time or add a deliberate dated block; retry generation safely.             |
| Preview stale                             | Another tab changed routine/blocks                               | Reload and preview again; never bypass version checks.                                              |
| Reminders missing                         | Preferences, generated plans, cron auth/run history, eligibility | Run protected processing with secure credentials; inspect inbox. Closed-app OS push is unavailable. |
| Secret leaked                             | Credential scope and exposure                                    | Rotate immediately, contain access, review logs, follow security policy.                            |

## Rollback

Stop writes if integrity is at risk. Roll back the app only if the prior build supports the current schema. If not, deploy a forward fix or restore a backup into a new database and explicitly account for writes since that backup. Do not run `migrate reset`, delete volumes, or force-rewrite migration history on production. Escalate unresolved data reconciliation to the product owner.

## Evidence still needed

Hosted environment selection, backup retention/restore timing, TLS/ingress checks, monitoring/log redaction, cron freshness alerting, load measurements and formal accessibility assessment are open. This runbook provides procedures; it does not establish that those controls have been deployed.
