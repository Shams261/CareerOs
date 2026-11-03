# Silsila

**Plan once. Show up daily.** Live at <https://usesilsila.me> since 2026-10-20.

Silsila is a private, single-owner execution system for someone preparing for software engineering interviews while working through a study plan. It turns weekly routines into dated plans, records what actually happened, runs DSA practice on a revision ladder, tracks job applications and interview rounds, closes each week with a review, mirrors the plan into a dedicated Google calendar, and reminds through an inbox and Web Push. Rumi, the built-in assistant, answers from the owner's own records, makes small changes with Undo, proposes bigger ones as cards the owner applies, and can be spoken to.

Formerly CareerOS: the package, database, cookies and export schema still say `careeros`.

## The problem

A study plan written on Sunday rarely survives Wednesday. Plans live in one tool, practice in another, applications in a spreadsheet, and nothing tells you plainly what happened versus what you meant to do. Silsila keeps the plan, the record and the review in one place, and keeps planned time and actual time as separate records so the gap is visible.

## Product philosophy

- **One owner, one workspace.** No teams, no sharing, no multi-tenant code paths.
- **Facts, not pressure.** Direct, restrained copy. No streaks, scores, badges or guilt. The one progress bar is on Plan's week.
- **Planned and actual are separate.** A routine is a template; a dated block is the plan; a session is what happened. Editing one never rewrites another.
- **Undo instead of confirm.** Almost every change, including Rumi's, carries an Undo.
- **AI that reads and proposes, with limits.** Rumi never reads notes, reflections, compensation or contacts. The owner sets the monthly AI limit; there is no hard-coded cap.

## What it does

| Area                   | What the owner does there                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today**              | The day's plan, the next block, Focus (start, pause, resume, complete), Close the day, Needs attention, Rumi's line for the morning, afternoon or evening |
| **Plan** (`/calendar`) | The week as one list, routines with a previewed edit, blocks moved or changed for one day, Prepare next week, Google Calendar sync                        |
| **Roadmap**            | Study roadmaps by week, item status and spaced revision, a default curriculum, a revision deck, "Ask Rumi" on an item                                     |
| **Practice** (`/dsa`)  | DSA problems, attempts (Shaky / Okay / Solid), a 3 → 7 → 14-day revision ladder, a pattern quiz                                                           |
| **Jobs**               | Applications, stages with history, interview rounds on the plan, results, follow-ups, prep docs with sources, mock answers, debriefs                      |
| **Weekly review**      | The week planned versus done, reflection, next week's priorities, Look Back over months                                                                   |
| **Settings**           | Account and sessions, Rumi and the AI limit, reminders and push, Google Calendar, appearance, data export                                                 |
| **Ask Rumi**           | A chat in a drawer on every page (⌘/), by text or voice, with reads shown as they run                                                                     |

Learn (`/learn`) still exists and is reachable by URL; it was taken out of the navigation on purpose.

## Architecture

A modular monolith on Next.js 16 (App Router), deployed as one container.

```
Browser ── proxy.ts (session gate, CSP nonce, rate limits, cron bearer)
              │
   Server Components (pages read through feature loaders)
   Server Actions (runAction: owner(), Zod, owner lock, Undo)
   Route handlers (/api/rumi/ask streaming, cron, webhook, export, health)
              │
   src/features/<feature>: domain.ts (pure rules) + service.ts (owner-scoped writes)
              │
   Kernel: src/lib (time, days, copy) · src/server/lock.ts · src/server/action.ts
              │
   PostgreSQL 17 (Prisma 7) · Google OIDC + Calendar · OpenRouter · Web Push
```

- Every page, action and API resolves the owner from the server session (`owner()`); no id is accepted from the browser.
- Multi-row writes run in a transaction holding the owner row lock; idempotency comes from unique keys (`routineKey + occurrenceDate`, request ids, dedupe keys).
- Instants are `timestamptz` in UTC sessions; calendar days are SQL `DATE` labels, read in the owner's IANA zone.
- Scheduled work is two bearer-protected endpoints called by external schedulers. No queues or workers.

Details: [architecture document](docs/architecture/SILSILA-ARCHITECTURE.md) ([PDF](docs/architecture/SILSILA-ARCHITECTURE.pdf)), [features](docs/architecture/features.md), [decisions](docs/architecture/decisions.md) (ADR-001 to ADR-031).

## Stack

Next.js 16.4 (webpack build), React 19, strict TypeScript, PostgreSQL 17 through Prisma 7 and its PostgreSQL adapter, Zod 4, date-fns and date-fns-tz, Tailwind 4 on Silsila's design tokens for new UI above hand-written styles in `src/app/app.css`, pnpm, ESLint, Prettier, Vitest, and Playwright with axe.

## Production

| Part       | What runs it                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| App        | Render free web service, Docker image from this repository, Ohio; deploys `main` after CI passes                     |
| Database   | Supabase free PostgreSQL 17, Canada Central, session pooler                                                          |
| Domain     | `usesilsila.me`, HTTPS with HSTS                                                                                     |
| Schedulers | cron-job.org (reminders every minute, calendar sync every 5–15 minutes) and a GitHub Actions caller every 15 minutes |
| Monitoring | Better Stack keyword monitor and an hourly GitHub workflow on `/api/health`; Settings → System status                |
| Backups    | A daily GitHub Actions dump, restore-checked and age-encrypted to the owner's key                                    |
| AI         | OpenRouter, pinned to Claude Haiku 5.5 on Google Vertex with zero data retention                                     |

Free tiers have limits (a sleeping instance, 0.1 CPU, a 500 MB database) that are accepted for one owner; see [deployment](docs/engineering/deployment.md) and [ADR-014](docs/architecture/decisions.md).

## Local setup

Requires Node.js 22.12+ (24 LTS recommended), pnpm 11, and PostgreSQL 17+ or Docker Compose.

```sh
cp .env.example .env
# Set CRON_SECRET and AUTH_SECRET (openssl rand -base64 32) to distinct random values.
# Set OWNER_EMAIL to the Google account that may sign in.
# Without a Google OAuth client, uncomment the fake-provider block in .env.example
# and run `pnpm google:fake` in another terminal (loopback only).
pnpm install
docker compose up -d db   # if PostgreSQL is not already available
pnpm db:generate
pnpm db:deploy
pnpm db:seed              # example data only; never against a personal database
pnpm dev
```

Open http://localhost:3000/today and sign in with Google (with `pnpm google:fake`, the fake provider signs in as `FAKE_LOGIN_EMAIL`, default `owner@example.com`). The seed creates a fictional owner and repeats safely.

Environment variables are listed in the [environment reference](docs/engineering/environment.md) and [`.env.example`](.env.example). In production the server refuses to start with missing or invalid configuration and names the variables without printing values. Nothing is exposed with `NEXT_PUBLIC_`.

To rehearse the production image: copy `.env.docker.example` to `.env.docker`, set the secrets, then `DB_PORT=5433 docker compose --profile app up --build`.

## Commands

```sh
pnpm dev                 # local server
pnpm lint                # eslint + prettier --check
pnpm typecheck           # prisma generate + next typegen + tsc
pnpm test                # vitest (database tests skipped without TEST_DATABASE_URL)
pnpm test:ci             # all tests; TEST_DATABASE_URL must be a disposable migrated database
pnpm build               # prisma generate + next build --webpack
pnpm test:e2e            # after a build: browser journeys + axe on a fresh silsila_e2e database
pnpm test:e2e:safari     # the same journeys in WebKit
pnpm test:e2e:firefox    # the same journeys in Firefox
pnpm docs:check          # documentation link check
pnpm db:migrate --name describe_change
pnpm db:deploy
pnpm db:backup           # custom-format dump into ./backups (git-ignored)
pnpm db:restore:verify <file>   # restores into a scratch database, checks, drops it
pnpm timestamps:audit    # read-only
```

## Testing

About 160 Vitest files (pure rules, and database suites against a disposable PostgreSQL), including owner-scoping security tests, migration upgrade tests, module-boundary tests and DST cases. Twenty-one Playwright journeys run with axe (WCAG 2.2 AA) in Chromium on every push, in WebKit weekly, and locally in Firefox. One journey loads every page and fails on a page error, a console error or a CSP violation.

## Security

Google OIDC with PKCE, state and nonce, allowlisted to one verified email; server-side sessions stored as token hashes; httpOnly, SameSite=Lax, Secure cookies; a nonce-based CSP, HSTS and rate limits; calendar refresh tokens encrypted with AES-256-GCM; cron endpoints behind a bearer secret; logs with a fixed vocabulary that never holds tokens or personal text. See [security](docs/engineering/security.md) and [SECURITY.md](SECURITY.md).

## Documentation

- [Engineering handbook](docs/README.md) and [contributing](CONTRIBUTING.md) (the work item workflow and the gate)
- [Architecture](docs/architecture/SILSILA-ARCHITECTURE.md), [current-state audit](docs/audits/SILSILA-COMPLETE-CURRENT-STATE-AUDIT.md), [release criteria](docs/product/RELEASE-CRITERIA.md), [roadmap](docs/product/ROADMAP.md)
- [Brand system](docs/product/brand-system.md) and the [changelog](CHANGELOG.md)

## Limitations

- One owner by design; the code refuses a second workspace.
- Free hosting tiers: the first request after idle can be slow, and the database is small.
- Voice uses the browser's recognition (Google in Chrome, Apple in Safari), outside the zero-retention AI path, behind an explicit consent.
- The official logo artwork is pending; a documented provisional mark is used.
- Real-device checks (push, voice, the installed app) are the owner's, on an Android phone; iOS Safari is covered by WebKit emulation only.

## Roadmap

Two weeks of owner use with measures first, then the items in [ROADMAP.md](docs/product/ROADMAP.md). Features are added only when that use shows a need.
