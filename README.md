# Silsila

**Plan once. Show up daily.** Live at <https://usesilsila.me>.

Silsila is a private, single-owner execution system. It turns weekly routines into dated plans and records what actually happened (Today, Plan, Focus, Close the day), keeps a study roadmap and DSA practice with a revision ladder, tracks job applications and interview rounds with sourced prep docs, closes each week with a review, mirrors dated blocks into a dedicated Google calendar, and reminds through an inbox and Web Push. Rumi, the assistant, answers from the owner's own records, plans with one-press cards, writes the day's lines and can be spoken to. Formerly CareerOS: the package, database, cookies and export schema still say `careeros`.

## Documentation

- [Engineering handbook](docs/README.md): architecture, [features](docs/architecture/features.md), [decisions](docs/architecture/decisions.md), operations and security.
- [Contributing](CONTRIBUTING.md): the work item workflow and the gate. [Security policy](SECURITY.md). [Changelog](CHANGELOG.md).
- [Brand system](docs/product/brand-system.md): identity, tokens, copy and design principles.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, PostgreSQL 17 through Prisma 7 and its PostgreSQL adapter, Zod 4, date-fns and date-fns-tz, Tailwind 4 on Silsila's design tokens for new UI (`src/app/globals.css`, `src/app/design-tokens.css`) above the hand-written styles in `src/app/app.css`, pnpm, ESLint, Prettier, Vitest and Playwright with axe. Forms use Server Actions and native controls. The build uses Next's webpack builder (`next build --webpack`).

- `src/app`: routes and API handlers.
- `src/features/<feature>`: `domain.ts` (pure rules), `service.ts` (owner-scoped reads and locked writes), `actions.ts`, and the feature's components.
- `src/components`: the shell and shared UI. `src/server`: database client, sessions and `owner()`, memo cache, health, job runs, export, security headers, rate limits. `src/lib`: environment, time, crypto, speech and validation helpers.
- `prisma`: schema, immutable SQL migrations, example seed. `tests`: pure and database tests. `e2e`: browser journeys. `scripts`: imports, backups, checks.

## Local setup

Requires Node.js 22.12+ (24 LTS recommended), pnpm 11, and PostgreSQL 17+ or Docker Compose.

```sh
cp .env.example .env
# Set CRON_SECRET and AUTH_SECRET (openssl rand -base64 32) to distinct random values.
# Set OWNER_EMAIL to the Google account that may sign in.
# Without a Google OAuth client, uncomment the fake-provider block in .env.example
# and run `pnpm google:fake` in another terminal (loopback only).
pnpm install
# If PostgreSQL is not already available:
docker compose up -d db
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

To rehearse the production image locally (Docker Desktop required), copy `.env.docker.example` to `.env.docker`, set `AUTH_SECRET` and `CRON_SECRET`, then run `DB_PORT=5433 docker compose --profile app up --build` and `docker compose --profile app exec app pnpm db:deploy`. The [deployment guide](docs/engineering/deployment.md) covers the Render + Supabase free-tier path ([ADR-014](docs/architecture/decisions.md#adr-014--render-and-supabase-free-tiers-while-the-heroku-credit-is-pending)) (the image follows ADR-013's portability rules).

Open http://localhost:3000/today and **Sign in with Google** (with `pnpm google:fake`, the fake provider signs in as `FAKE_LOGIN_EMAIL`, default `owner@example.com`). The example seed creates Alex Morgan; edit the stored profile for your own name. The seed is explicitly development/example data, including a fictional job posting. Do not run it against a real personal dataset unless you want these examples. Repeating it preserves existing records, preferences, and progress; the next seven days are generated once from the saved routine. Default routines are inserted only when creating the seed owner for the first time. Existing owners keep their existing routines; rerunning seed never resurrects a deleted routine. This seed assumes one owner and is not a multi-user provisioning tool.

Environment variables are listed in the [environment reference](docs/engineering/environment.md) and [`.env.example`](.env.example). In production the server refuses to start with missing or invalid configuration, naming the variables but never printing values. No variables are exposed with `NEXT_PUBLIC_`, and no secrets belong in source control.

**Access.** Only the Google account in `OWNER_EMAIL` can sign in (OIDC with PKCE, `openid email`). Sessions are server-side (a hashed token, httpOnly cookie, 30 days, revoked on sign-out). Every private page redirects to `/login` and every private API returns 401 without a session. The two scheduler endpoints accept only `Authorization: Bearer $CRON_SECRET`. Production requires HTTPS and sends HSTS, a nonce-based CSP and other security headers; public endpoints are rate-limited. Mutations always scope data to the signed-in owner, and Server Actions keep Next.js' same-origin checks. See [security](docs/engineering/security.md) and [ADR-012](docs/architecture/decisions.md#adr-012--single-owner-google-sign-in-server-sessions-and-web-push-wi-008).

## Commands

```sh
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:check
# With TEST_DATABASE_URL set to a disposable migrated database:
pnpm test:ci
pnpm build
# After a build: browser journeys with axe against a fresh silsila_e2e database (WI-052)
pnpm test:e2e
pnpm start
pnpm format
pnpm db:migrate --name describe_change
pnpm db:deploy
pnpm db:seed
pnpm timestamps:audit    # read-only; see docs/engineering/operations.md
pnpm timestamps:repair   # dry-run unless --apply --confirm=<database>
pnpm db:backup           # custom-format dump into ./backups (git-ignored)
pnpm db:restore:verify <file>  # restores into a new scratch database, checks, drops it
# Local sign-in / browser tests against a fake Google (never a real account):
pnpm google:fake
```

`pnpm build` generates the Prisma client; pages are dynamic, so build does not need a live database. Runtime does. Run migrations as a deployment step before switching application traffic. Commit the lockfile and migration files. Integration tests require `TEST_DATABASE_URL` pointing to a migrated disposable database and are skipped otherwise; they create and remove their own isolated test user.

## Data and time

PostgreSQL is the only durable store; restarting the server loses nothing, and the browser keeps only per-device conveniences. Instants are `timestamptz` handled in UTC database sessions, and calendar labels (a plan's day, revision and review dates) are SQL `DATE`s; the owner's IANA zone decides local days and DST ([architecture](docs/architecture/overview.md#time-storage), ADR-003 and ADR-009). Backups, restore checks and the migration checklist are in [backup and restore](docs/engineering/backup-restore.md); scheduled jobs and the legacy timestamp repair are in [operations](docs/engineering/operations.md).
