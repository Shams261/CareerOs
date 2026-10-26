# Deployment guide (personal production)

One recommended path. Other hosts work if they meet the same four requirements.

| Piece     | Recommendation                                                                                                          | Why                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App       | **One long-running Node.js 24 process** (`pnpm start`) on a small VM or a PaaS "web service" (not serverless functions) | `after()` background syncs, the in-process rate limiter and the connection pool all assume a persistent process. One instance is plenty for one owner. |
| Database  | **Managed PostgreSQL 17** with TLS, automated daily backups and point-in-time recovery, in the same region              | Durability belongs to the provider; `pnpm db:backup` adds an independent copy you control.                                                             |
| HTTPS     | The platform's TLS termination, or Caddy/nginx with automatic certificates in front of `127.0.0.1:3000`                 | Required: `Secure` cookies, HSTS, Web Push and Google OAuth all need HTTPS. The proxy must set `X-Forwarded-For`.                                      |
| Scheduler | The host's cron (or the platform's cron jobs) calling two `curl` commands                                               | Reminders and Calendar sync need a clock outside the browser. See the [cron table](operations.md#scheduled-jobs).                                      |

## Local rehearsal with Docker

Install Docker Desktop (free for personal use). Then, from the repository:

```sh
cp .env.docker.example .env.docker      # set AUTH_SECRET (openssl rand -base64 32) and CRON_SECRET
DB_PORT=5433 docker compose --profile app up --build   # Postgres 17 + the production image
docker compose --profile app exec app pnpm db:deploy   # migrate the container database
curl -s http://127.0.0.1:3000/api/health                # {"status":"ok","database":"ok","sessionTimeZone":"UTC","schema":"current"}
curl -sI http://127.0.0.1:3000/today | head -3          # 307 to /login?next=%2Ftoday with security headers
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/notifications/process   # 401
docker compose --profile app down                       # keeps the careeros_data volume
```

`DB_PORT=5433` avoids a local PostgreSQL on 5432. Sign-in cannot complete in the rehearsal (no Google client and no HTTPS); it checks configuration, migrations, headers, redirects and the cron gate. To see fail-fast validation, run the image without variables: `docker run --rm -e NODE_ENV=production silsila` exits with code 1 and names the missing variables.

## Chosen path: Render free web service + Supabase free PostgreSQL (ADR-014)

Decision record: [ADR-014](../architecture/decisions.md#adr-014--render-and-supabase-free-tiers-while-the-heroku-credit-is-pending). The app runs as a **Render free web service** built from the repository `Dockerfile` ([`render.yaml`](../../render.yaml) declares it), and the database is a **Supabase free project** (PostgreSQL 17, 500 MB) reached through Supabase's IPv4 **session pooler**. Cost is $0 and no card is needed. Free instances have no shell, so migrations and backups run from a workstation against the Supabase URL. The per-minute reminder job is the inbound traffic that keeps the free instance from spinning down. Commands marked _(owner)_ need your accounts.

### Prerequisites

- The [local rehearsal](#local-rehearsal-with-docker) above has passed on the commit you deploy.
- `pg_dump` 17 or newer for backups: `brew install libpq` and use `/opt/homebrew/opt/libpq/bin/pg_dump` (the Homebrew `postgresql@16` client cannot dump a 17 server).

### 1. Supabase project _(owner)_

1. Sign in at [supabase.com](https://supabase.com) with GitHub, create an organisation on the Free plan, then **New project**: name `silsila`, region **Canada (Central)**, a strong database password saved in your password manager (it is part of the connection URL).
2. Project → **Connect** → choose **Session pooler** (not Direct, not Transaction): the URI looks like `postgresql://postgres.<ref>:<password>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`. Direct connections are IPv6-only and Render has no outbound IPv6; the transaction pooler (port 6543) breaks prepared statements and Prisma migrations.
3. From the repository, migrate and verify the empty database (TLS is required by Supabase, and its pooler certificate is not in the system store):

```sh
export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres'
export DATABASE_SSL=no-verify
pnpm db:deploy
psql "$DATABASE_URL?sslmode=require" -c 'SHOW TimeZone'   # expect UTC
```

To verify certificates instead, download the CA from Project settings → Database → SSL, store it outside the repository, and use `DATABASE_SSL=verify-full DATABASE_SSL_CA=/path/to/prod-ca-2021.crt`.

### 2. Render service _(owner)_

1. Sign in at [render.com](https://render.com) with GitHub and allow access to `Shams261/CareerOs`.
2. **Blueprints → New Blueprint Instance**, pick the repository and branch `main`. Render reads `render.yaml`, generates `CRON_SECRET`, `AUTH_SECRET` and `CALENDAR_TOKEN_ENCRYPTION_KEY`, and asks for the `sync: false` values: `DATABASE_URL` (the session-pooler URI above), `OWNER_EMAIL` (your Google account), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ([Google production checklist](google-production.md)), and the three VAPID values (`pnpm exec web-push generate-vapid-keys`; `VAPID_SUBJECT=mailto:<you>`). Leave the VAPID trio empty to start without push.
3. Apply. The first Docker build takes several minutes. The service URL is `https://silsila.onrender.com` (or with a suffix if the name is taken; `APP_BASE_URL` stays the custom domain).
4. Logs must show no configuration warning and no time-zone error. Then run the [smoke test](#6-smoke-test) against the `onrender.com` URL; sign-in works only once the custom domain and Google redirect URIs are in place.

### 3. Domain and TLS _(owner)_

Service → **Settings → Custom Domains**: add `usesilsila.me` and `www.usesilsila.me`. At Namecheap → Advanced DNS: an **A** record, host `@`, value `216.24.57.1`, and a **CNAME**, host `www`, value `silsila.onrender.com` (TTL automatic, no other A/CNAME for those hosts). Render verifies the records and issues certificates automatically; `www` redirects to the root. Then in the Google Cloud console add `https://usesilsila.me/api/auth/callback` and `https://usesilsila.me/api/calendar/oauth/callback` as redirect URIs and repeat the smoke test on the custom domain.

### 4. Scheduler _(owner)_

[cron-job.org](https://cron-job.org) (free, per-minute, custom headers): two jobs per the [cron table](operations.md#scheduled-jobs), method `POST`, header `Authorization: Bearer <CRON_SECRET from the Render environment>`, timeout 30 s, failure notifications on. Settings → System status must show a recent success for both. Expect the first call after a spin-down to take about a minute; the cron keeps the instance awake afterwards.

### 5. Backups and updates _(owner)_

Supabase Free has no automated backups. Weekly, and before every migration:

```sh
DATABASE_URL='<session-pooler URI>' PATH="/opt/homebrew/opt/libpq/bin:$PATH" pnpm db:backup
pnpm db:restore:verify backups/<file>.dump   # into a scratch database on the local server
```

Updating is a push to `main`: Render deploys after the Quality workflow passes (`autoDeployTrigger: checksPass`). If the release contains migrations, run `pnpm db:deploy` from the workstation **before** the deploy finishes serving traffic (additive migrations are safe in either order; see [operations](operations.md#release-checklist)). Rollback: Render → Deploys → previous deploy → Rollback; migrations are forward-only.

### 6. Limits to know

750 free instance hours per workspace per month (a month of one always-on service is 744). 512 MB RAM and a fractional CPU: pages render in hundreds of milliseconds, not tens. Supabase pauses a free project after 7 days without activity (the cron prevents this) and the session pooler caps clients at the project's pool size (default 15; the app uses 5). If the GitHub Student Heroku credit is granted later, the [Heroku path](#alternative-path-heroku-container-stack-adr-013) remains valid with the same image.

## Alternative path: Heroku container stack (ADR-013)

Kept as the documented alternative; `heroku.yml` remains in the repository. The free-tier path above was chosen on 2026-10-02 because the student credit had not been granted after six days ([ADR-014](../architecture/decisions.md#adr-014--render-and-supabase-free-tiers-while-the-heroku-credit-is-pending)).

Decision record: [ADR-013](../architecture/decisions.md#adr-013--heroku-container-hosting-with-portable-12-factor-constraints). Heroku builds the repository's `Dockerfile` (declared in `heroku.yml`) and runs it as the `web` process on an **Eco** dyno with **Postgres Essential-0** (PostgreSQL 17, 1 GB, 20 connections). The GitHub Student Developer Pack credit covers both for 24 months. The sections after this one remain the host-independent reference; this section is the concrete sequence. Commands marked _(owner)_ need your account; nothing here is run for you.

### Create the app _(owner)_

1. Apply for the [Heroku student offer](https://www.heroku.com/github-students/) through the Student Pack, add a payment method, and install the CLI (`brew tap heroku/brew && brew install heroku`, then `heroku login`).
2. Create the resources in the US region (closest to Toronto):

```sh
heroku create silsila --region us --stack container
heroku addons:create heroku-postgresql:essential-0 --app silsila
heroku ps:type eco --app silsila
```

`DATABASE_URL` is injected by the add-on and rotates when Heroku maintains credentials; never copy it into another variable.

### Configure _(owner)_

Generate the secrets from [1. Prepare secrets](#1-prepare-secrets) and set them with `heroku config:set … --app silsila`. Required: `APP_BASE_URL=https://usesilsila.me`, `OWNER_EMAIL`, `CRON_SECRET`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_SSL=no-verify`, `DATABASE_POOL_MAX=5`. Optional: `CALENDAR_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_WEBHOOK_BASE_URL=https://usesilsila.me`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `OPENROUTER_API_KEY` (Grill Me, WI-031). Try `DATABASE_SSL=verify-full` first; if the start-up log shows a certificate error, use `no-verify` (encrypted, unverified, Heroku's documented mode). Do not set any `GOOGLE_OAUTH_*_URL` override.

### Deploy _(owner)_

Dashboard → Deploy → GitHub: connect `Shams261/CareerOs`, enable **Automatic deploys** from `main` with **Wait for CI to pass before deploy**. Trigger the first deploy manually, then:

```sh
heroku logs --tail --app silsila          # expect no configuration warning and no time-zone error
heroku run pnpm db:deploy --app silsila   # migrations, owner-run
curl https://silsila-<hash>.herokuapp.com/api/health
```

The database starts empty; the first sign-in with the `OWNER_EMAIL` account creates the owner. Never run `pnpm db:seed` here.

### Domain and TLS _(owner)_

```sh
heroku domains:add usesilsila.me --app silsila
heroku domains:add www.usesilsila.me --app silsila
heroku certs:auto:enable --app silsila
heroku domains --app silsila             # shows one DNS target per domain
```

At Namecheap → Advanced DNS: an **ALIAS** record for `@` and a **CNAME** for `www`, each pointing at the DNS target Heroku printed (no proxy, TTL automatic). Certificates issue within an hour of DNS resolving. Then in the Google Cloud console add `https://usesilsila.me/api/auth/callback` and `https://usesilsila.me/api/calendar/oauth/callback` as redirect URIs ([Google production checklist](google-production.md)), and repeat the [smoke test](#6-smoke-test) on the custom domain.

### Scheduler _(owner)_

Heroku Scheduler runs at most every 10 minutes, so use [cron-job.org](https://cron-job.org) (free, per-minute, custom headers): two jobs per the [cron table](operations.md#scheduled-jobs), method `POST`, header `Authorization: Bearer <CRON_SECRET>`, timeout 30 s, notifications on failure. The per-minute call also keeps the Eco dyno awake. Settings → System status must show a recent success for both jobs.

### Backups and updates _(owner)_

Before every migration: `heroku pg:backups:capture --app silsila` (Essential plans support manual captures, not schedules) and, independently, `DATABASE_URL="$(heroku config:get DATABASE_URL --app silsila)" pnpm db:backup` from a workstation, verified with `pnpm db:restore:verify`. Updating is a push to `main`: CI passes, Heroku builds and releases the image, then `heroku run pnpm db:deploy` if the release contains migrations. `heroku releases:rollback` restores the previous image; migrations are forward-only.

### Costs and limits

Eco dynos: $5 per month for 1000 shared hours (a month of web time is 744). Essential-0: $5 per month, 1 GB, 20 connections (the pool uses 5). The student credit covers $13 per month for 24 months. The dyno restarts daily and on every release; in-memory rate limits reset then. The container's filesystem is ephemeral, which the application never relies on.

## 1. Prepare secrets

Generate each once and store it in the host's secret manager ([environment reference](environment.md)):

```sh
openssl rand -base64 36   # CRON_SECRET
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CALENDAR_TOKEN_ENCRYPTION_KEY (optional, enables Calendar)
pnpm exec web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (optional, enables push)
```

Set `APP_BASE_URL=https://<your-host>`, `OWNER_EMAIL`, `DATABASE_URL`, `DATABASE_SSL` (`no-verify` or `verify-full` for managed PostgreSQL), `DATABASE_POOL_MAX=5`, `VAPID_SUBJECT=mailto:<you>`, and the Google client from the [Google production checklist](google-production.md). Do not set any `GOOGLE_OAUTH_*_URL` override in production.

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

Serverless/edge functions (no persistent process for `after()` or the rate limiter, pool exhaustion; do not assume compatibility unless the architecture is deliberately changed and verified), several app instances (per-instance rate limits, duplicate background syncs; the leases keep data safe but waste work), plain HTTP on the internet, and sharing the database with other applications.
