# Deployment guide (personal production)

One recommended path. Other hosts work if they meet the same four requirements.

| Piece     | Recommendation                                                                                                          | Why                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App       | **One long-running Node.js 24 process** (`pnpm start`) on a small VM or a PaaS "web service" (not serverless functions) | `after()` background syncs, the in-process rate limiter and the connection pool all assume a persistent process. One instance is plenty for one owner. |
| Database  | **Managed PostgreSQL 17** with TLS, automated daily backups and point-in-time recovery, in the same region              | Durability belongs to the provider; `pnpm db:backup` adds an independent copy you control.                                                             |
| HTTPS     | The platform's TLS termination, or Caddy/nginx with automatic certificates in front of `127.0.0.1:3000`                 | Required: `Secure` cookies, HSTS, Web Push and Google OAuth all need HTTPS. The proxy must set `X-Forwarded-For`.                                      |
| Scheduler | The host's cron (or the platform's cron jobs) calling two `curl` commands                                               | Reminders and Calendar sync need a clock outside the browser. See the [cron table](operations.md#scheduled-jobs).                                      |

## 1. Prepare secrets

Generate each once and store it in the host's secret manager ([environment reference](environment.md)):

```sh
openssl rand -base64 36   # CRON_SECRET
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CALENDAR_TOKEN_ENCRYPTION_KEY (optional, enables Calendar)
pnpm exec web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (optional, enables push)
```

Set `APP_BASE_URL=https://<your-host>`, `OWNER_EMAIL`, `DATABASE_URL` (with `sslmode=require` or the provider's equivalent), `DATABASE_POOL_MAX=5`, `VAPID_SUBJECT=mailto:<you>`, and the Google client from the [Google production checklist](google-production.md). Do not set any `GOOGLE_OAUTH_*_URL` override in production.

## 2. Database

Create the database and an application role with ownership of its schema. If the provider puts a **transaction-mode pooler** in front of PostgreSQL, it may drop the `TimeZone=UTC` startup option; run `ALTER DATABASE <name> SET TimeZone = 'UTC'` (safe for a new database). The start-up check refuses to run if the session is not UTC. Use a direct (non-pooled) URL for migrations if the provider recommends it.

## 3. Build and migrate

```sh
pnpm install --frozen-lockfile
pnpm build                 # generates the Prisma client; does not need the database
pnpm db:backup             # skip only for a brand-new empty database
pnpm db:deploy             # applies checked-in migrations; never `db push`
```

Do **not** run `pnpm db:seed` against a real personal database; the owner row is created on first sign-in. For an existing personal database follow the [personal database migration checklist](backup-restore.md#migrating-an-existing-personal-database) instead.

## 4. Run

Start `pnpm start` under the platform's process manager (or a systemd unit with `Restart=always`) listening on `PORT` (default 3000) behind HTTPS. On start the server validates configuration (and exits on problems in production), confirms the UTC session, and logs a single warning if anything needs attention.

## 5. Scheduler

```sh
* * * * *    curl -fsS -m 50 -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/notifications/process
*/10 * * * * curl -fsS -m 120 -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/calendar/sync
```

Keep `CRON_SECRET` in the cron environment or a root-only file, not in the crontab line itself when the host shares crontabs. Settings → System status shows the last success of each job.

## 6. Smoke test

1. `curl https://<host>/api/health` → `{"status":"ok","database":"ok","sessionTimeZone":"UTC","schema":"current"}`.
2. `curl -I https://<host>/today` → `307` to `/login?next=%2Ftoday`, with `strict-transport-security` and `content-security-policy` headers.
3. `curl -X POST https://<host>/api/notifications/process` without the bearer → `401`.
4. Sign in with the owner account; sign in with any other Google account → refused.
5. Follow the [onboarding checklist](../product/onboarding.md).

## Updating

Back up, deploy the new build, run `pnpm db:deploy`, restart, then run the smoke test. Migrations are forward-only; see [rollback](operations.md#rollback).

## Not recommended

Serverless/edge functions (no persistent process for `after()` or the rate limiter, pool exhaustion), several app instances (per-instance rate limits, duplicate background syncs; the leases keep data safe but waste work), plain HTTP on the internet, and sharing the database with other applications.
