# Silsila

Brand: **Silsila** · Domain: **usesilsila.me** · Promise: **Plan once. Show up daily.**

Silsila is a single-owner personal execution system. It turns recurring routines into dated plans, records what actually happened, runs DSA and technical-learning revision, tracks job applications and interview rounds, mirrors dated blocks into a dedicated Google calendar, closes each week with a review, and delivers reminders through an inbox and Web Push. Formerly CareerOS; technical identifiers (package name, database name, cookies, export schema) intentionally still say `careeros`.

This file is a navigation and invariant map. The repository is the source of truth; when in doubt read the schema, services, tests and `docs/`.

If CLAUDE.md conflicts with the implementation, schema, tests, migrations or an accepted ADR, the repository state wins. Call out the discrepancy before changing behavior.

## Current product state

Latest completed work item: **WI-012** (the Roadmap as the single study tracker, 2026-10-21), after WI-011 (undo, summaries, phone navigation, shortcuts overlay), WI-010 (week chart, motion, notes to self, snapshot cache), WI-009 (UX simplification, roadmap and goals), WI-008 (personal production launch, live since 2026-10-20) and the brand system.

- **Schedule and execution (WI-001/002):** weekly RoutineBlocks, idempotent DailyPlan/TimeBlock generation, per-occurrence overrides, start/stop/resume/complete/skip/cancel, manual sessions, one running session per owner, daily check-in.
- **DSA (WI-003):** topics, problems, append-only attempts, RED/YELLOW/GREEN confidence, spaced revision dates, due/overdue queue.
- **Technical learning (WI-004):** subjects, topics, four 0–3 mastery dimensions, append-only activities, review dates.
- **Jobs (WI-005):** applications, stage history, next actions with action ownership, multiple InterviewRounds per application, prep items, DSA/learning links, reminders.
- **Time integrity (WI-005.1):** UTC-pinned sessions, startup check, timestamp audit and guarded repair, MaintenanceRecord.
- **Google Calendar (WI-006):** dedicated app-created calendar, encrypted refresh token, incremental sync, conflicts, watch channels, cron/manual sync.
- **Weekly review (WI-007):** Monday–Sunday live metrics, reflection, priorities, Prepare next week.
- **Production (WI-008):** Google owner sign-in, server sessions, CSP/HSTS/rate limits, env validation, Web Push, PWA, health, JobRun status, export, backup and restore verification.
- **UX simplification (WI-009):** first-run cards on Today, Practice, Learn and Jobs; visible primary actions (`Disclosure` replaces `<details>` for forms); plain vocabulary; filters and counters only once data exists; three-screen weekly review; sidebar Today / Plan / Roadmap / Practice / Learn / Jobs / Weekly review / Settings; Google Calendar panel lives in Settings; inline form feedback with a pending state and auto-clearing success.
- **Week at a glance, motion, notes (WI-010):** per-day planned/recorded minutes in `scheduleWeek` and a bar chart on review step one; motion only under `prefers-reduced-motion: no-preference`; `QuickNote` captured from the shell, listed on Today until done. No streak, no score.
- **Goals and roadmap (WI-009):** `Goal` authoring with target dates and live weekly progress; `Roadmap` → `RoadmapItem` (sections, concepts/questions, status, asked-in-interview mark, optional links to Learn topics and Practice problems/topics). A roadmap is a planning layer: it never changes mastery, attempts or revision dates (ADR-016). Today shows the chain (14 days, record not score), goals, a day-closed card, a live timer and keyboard shortcuts; the running session sits in the shell on every page.
- **The Roadmap as the tracker (WI-012, ADR-018):** items carry scope, checkpoint, priority (P0–P2), estimate, read-only references, source and an import slug; roadmaps carry a study prompt template and scenarios; **Copy prompt** renders on the client (`src/features/roadmap/study-prompt.tsx`) so the owner studies in Claude or ChatGPT and marks the item here. Filters above eight items; Continue on the overview; Next on Today. Material is imported, never committed: `pnpm roadmap:bundle` (parsers `scripts/lib/roadmap-sources.ts`; researched curriculum as data in `scripts/lib/dsa-curriculum.ts` and `scripts/lib/interview-research.ts`) then `pnpm roadmap:import` (idempotent; keyed by roadmap title, item slug, topic name, problem URL; never overwrites marks, attempts, confidence or owner notes). DSA problems from the bundle are `DsaProblem`s in Practice. `scripts/reset-owner-data.sql` is the one-time production reset. Item notes, references and the bundle are owner material: never logged; in the export. **Revision lives in the roadmap:** Done schedules `nextRevisionAt` (DATE label) 7 days out, Revised moves it to 14/30/60 (`scheduleRevision`), Reopen clears it; Today's "Revise today" card and the `TECHNICAL_REVIEW` reminder read it. **Learn is off the navigation** since WI-012 (routes, data and tests kept; removal is a later decision).

## Architecture

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4, Zod 4, date-fns/date-fns-tz, pnpm, Vitest. Build uses `next build --webpack`.
- PostgreSQL 17 via Prisma 7 and `@prisma/adapter-pg`. Migrations are versioned SQL in `prisma/migrations`.
- **Server Components by default.** Client components only for navigation state, form feedback, push controls and error recovery. No client data stores.
- Forms use Server Actions and native controls with Zod validation. React Hook Form is not used.
- Layout: `src/app` routes and API handlers; `src/features/<domain>` with `domain.ts` (pure rules) and `service.ts` (orchestration and DB writes); `src/server` for db client, sessions, `owner()`, security headers, rate limits, health, jobs, export; `src/lib` for env, time, crypto and validation helpers.
- **Owner scoping:** every page, action and private API calls `owner()` from `src/server/db.ts`, which resolves the signed-in user from the session cookie. Queries are scoped by that id.
- **Notifications:** `NotificationLog` is the durable inbox, filled by `POST /api/notifications/process` (cron). Web Push is a delivery channel on top of it, not a separate engine; the inbox row survives push failure.
- **Google Calendar:** `CalendarConnection` per owner, `TimeBlock` carries the external event id, etag, hash and sync status. Sync runs from cron, manual "Sync now", or a webhook-triggered pass. Only the dedicated calendar is ever read or written.
- Scheduled work is external cron hitting two bearer-protected endpoints. No queues, Redis or workers.
- **Request cost discipline (WI-010):** every statement is a cross-region round trip in production. `currentSession` is request-cached; aside cards on Today sit behind Suspense; pages load only what the visible step needs; navigation links do not prefetch; the client refresh is five minutes. Read-only snapshots go through `memo()` in `src/server/memo.ts` (twenty seconds, dropped by every write; ADR-017); never cache the day's blocks, sessions or the running session. Measure with PostgreSQL `log_statement` on a local `next start` before adding queries to a page (recipe in `docs/WI-010-HANDOFF.md`).

## Core domain invariants

Violating any of these is a bug, not a design choice.

- `RoutineBlock` (template) → `DailyPlan` (dated) → `TimeBlock` (planned occurrence) → `ActualSession` (what happened). Planned and actual time are separate records; never derive one from the other.
- Editing a dated `TimeBlock` never modifies its `RoutineBlock`. Propagation of a routine **edit** to future occurrences is an explicit, previewed choice. A **newly created** routine is added to already-planned days from today on (future slots only, never replacing or editing an existing block, overlapping slots skipped) so the first routine shows on Today (ADR-015).
- Generation is idempotent (`@@unique([routineKey, occurrenceDate])`); regenerating a day never duplicates or overwrites edited blocks.
- At most one running session per owner (`one_running_session_per_user` partial unique index).
- Automatic generation fills today → Sunday only (`generateThroughSunday`, run when Today or Plan is viewed). Next week is generated by **Prepare next week**. There is no manual "generate" control. Do not reintroduce unconditional 14-day generation.
- `RoutineBlock` never syncs to Google. `TimeBlock` ↔ Google event only. `ActualSession` never syncs. Google edits touch only the dated occurrence.
- Silsila reads and writes only its own app-created calendar (`calendar.app.created`). Events without Silsila private properties are ignored, never mutated.
- DSA (`DsaProblem` → `DsaAttempt` → confidence → revision) and technical learning (`LearningTopic` → activity → mastery → review) are distinct models. Do not merge them or auto-convert other domains into either. `RoadmapItem` may link to either but never writes to them; marking an item done or asked changes the item only.
- `JobApplication` has many `InterviewRound`s. Never model one interview as the application.
- The roadmap never writes to Learn or Practice; marks change the item only (ADR-016/018). Imported items are keyed by `(roadmapId, slug)`; owner-added items have no slug. An import must never overwrite `status`, `completedAt`, `askedInInterview`, `askedNote`, attempts, confidence, or notes the owner has written.
- Attempts, activities, job activities and stage history are append-only.
- Owner id comes from the server session only. Never accept a user id from the browser.
- Existing migrations are immutable; schema changes get a new migration. Multi-row mutations use transactions and the advisory locks already in `schedule/service.ts` and `calendar/service.ts`.

## Time and timezone rules

Policy from WI-005.1 / ADR-003 / ADR-009. Read `docs/architecture/decisions.md` before touching anything date-related.

- **Real instants** (`plannedStart`, `startedAt`, `scheduledStart`, `sentAt`, `createdAt`) are `timestamptz`. They are stored as true UTC instants.
- **Calendar labels** (`DailyPlan.date`, `occurrenceDate`, revision and review dates, applied and next-action dates) are PostgreSQL `DATE`. A DATE is a label, never an instant; never convert it through `new Date(...)` UTC arithmetic.
- Every application PostgreSQL session is pinned to `TimeZone=UTC` (`src/lib/database.ts`); startup refuses to run otherwise. Transaction poolers may need `ALTER DATABASE … SET TimeZone = 'UTC'`.
- The owner timezone (`User.timezone`, currently America/Toronto) controls rendering and local-day boundaries. Never use fixed offsets; DST must stay correct.
- A legacy audit and guarded repair exist (`pnpm timestamps:audit`, `pnpm timestamps:repair`). Procedure: `docs/engineering/backup-restore.md`. Never run the repair twice.

## Authentication and security

- One owner. Google OIDC sign-in (PKCE, state, nonce, `openid email`), allowlisted by `OWNER_EMAIL`, verified email only. A database with a different stored owner refuses sign-in rather than creating a second workspace.
- Sessions are server-side rows holding a token hash; the cookie is httpOnly, SameSite=Lax, Secure over HTTPS, 30 days, revoked on sign-out. `src/proxy.ts` gates every private page and API.
- Google **login** and Google **Calendar** authorization are separate consents. Calendar refresh tokens are AES-256-GCM encrypted with `CALENDAR_TOKEN_ENCRYPTION_KEY`.
- Cron endpoints accept only `Authorization: Bearer $CRON_SECRET`. The calendar webhook validates channel id and token. Nonce CSP, HSTS in production, per-IP rate limits, fail-fast env validation.
- Never log tokens, codes, secrets, keys, job-description text, compensation, reflections or contact details. Log vocabulary is fixed in `docs/engineering/security.md`.

## Brand and UI rules

- Brand **Silsila**, domain **usesilsila.me**. Primary: _Plan once. Show up daily._ Secondary: _Keep the chain going._ Never render the product name as "UseSilsila" except when quoting the URL.
- **Light is the default theme regardless of OS or browser appearance.** Dark is opt-in via Settings and saved in the `silsila-theme` cookie; the server resolves it before render. Only Light and Dark are offered.
- Tokens live in `src/app/design-tokens.css` (runtime) and `src/assets/design-tokens.json` (handoff). Light: canvas `#F6F3EC`, surface `#FCFAF5`, ink `#1B1A16`, teal `#1E6B5B`, secondary `#6A655D`, border `#D9D3C7`. Dark: canvas `#14130F`, accent `#4FB59F`. Semantic: success `#347A5C`, warning `#A86F19`, danger `#A94843`, info `#4F7080`.
- Voice: calm, factual, restrained. No streaks, scores, guilt or hustle copy; the chain on Today is a record of days with recorded work or a review and must never become a counter, a streak or a comparison. Navigation labels say what you do there: Today, Plan (`/calendar`), Roadmap, Practice (`/dsa`), Jobs, Weekly review (`/review`), Settings; Learn (`/learn`) is reachable by URL only; routes are unchanged. User-facing copy never says "dated plan", "occurrence", "override" or "generate": a changed block is "Changed for this day", a manual block is "Added for this day". No muted explanatory paragraph under a form; rules surface as validation messages. One primary action per page, visible; secondary forms open in place through `src/components/disclosure.tsx`, never `<details>`.
- Official logo assets under `public/brand/` are authoritative; do not redraw or approximate the Silsila mark/wordmark in code.
- The supplied logo artwork is authoritative. `src/components/brand.tsx` currently holds a documented provisional mark and text fallback; do not recreate the wordmark from a font. Full rules: `docs/product/brand-system.md`.

## Development workflow

Work is delivered as small, focused work items (`WI-XXX`).

Before changing code: inspect the relevant implementation, `prisma/schema.prisma`, existing migrations, existing tests and the relevant docs/ADR; identify the smallest correct change and its architecture impact. Then implement without stopping at the plan.

After implementing: run the verification commands below, update docs and CHANGELOG, write a handoff (`docs/WI-XXX-HANDOFF.md`), and stop. Do not begin the next WI automatically.

**Current phase: feature freeze.** New product features are paused until Silsila has been deployed and used for real. See "Current next step".

## Commands

```sh
pnpm dev                 # local server; pair with `pnpm google:fake` for sign-in without a real Google client
pnpm lint                # eslint + prettier --check
pnpm typecheck           # prisma generate + next typegen + tsc
pnpm test                # vitest (database tests skipped without TEST_DATABASE_URL)
pnpm test:ci             # all tests; requires TEST_DATABASE_URL = disposable migrated DB
pnpm build               # prisma generate + next build --webpack
pnpm docs:check          # documentation link check
pnpm db:generate
pnpm db:migrate --name describe_change
pnpm db:deploy
pnpm db:seed             # example data only; never against a personal DB
pnpm exec tsx scripts/verify-seed.ts   # seed idempotency
pnpm timestamps:audit    # read-only
pnpm timestamps:repair   # dry-run unless --apply --confirm=<db>
pnpm db:backup
pnpm db:restore:verify <file>          # restores into a new scratch DB, then drops it
pnpm roadmap:bundle "<sources folder>" # study materials → roadmap-bundle.json (needs pdftotext); never committed
pnpm roadmap:import <bundle.json>      # idempotent import for the single owner (DATABASE_URL)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/reset-owner-data.sql   # one-time owner data reset; verified backup first
```

Local quirk: node and pnpm are installed via nvm (`~/.nvm/versions/node/v24.17.0/bin`). Disposable test databases go on the Homebrew PostgreSQL 16 at 5432. The `.env` database on 127.0.0.1:55432 is a second Homebrew instance with its data directory in `/private/tmp`; it holds only the example seed, never personal data. Production rehearsal: `DB_PORT=5433 docker compose --profile app up --build` (see README).

## Testing expectations

- Existing tests are regression contracts. Never delete or weaken a test to make new work pass.
- Full pre-handoff gate: `prisma format`, `db:generate`, `lint`, `typecheck`, `test:ci`, `build`, `docs:check`, `git diff --check`.
- Schema changes additionally need: clean `db:deploy` on a fresh DB, an upgrade test from the previous migration, `prisma migrate diff --exit-code` drift check, and seed run twice.
- Use disposable databases only. Never run migrations, seed, repair or tests against the personal database.
- Meaningful UI work is browser-checked at about 1440px and at 390px: no console errors, no horizontal overflow, no accessibility regressions (axe was clean at WI-008). Local loop: `pnpm google:fake` plus `pnpm dev` against a disposable migrated database (`.env` points at `silsila_dev_empty` on the Homebrew PostgreSQL at 5432 during UI work; restore the seed `.env` from `.env.local-seed-55432.bak` afterwards).

## Production and operations

State as of 2026-10-20: **Silsila is live at https://usesilsila.me** on a Render free web service (Docker image from this repo, Ohio, service `silsila`, auto-deploys `main` after CI passes) with Supabase free PostgreSQL 17 (Canada Central, session pooler, `DATABASE_SSL=no-verify`). ADR-014; Heroku (ADR-013, `heroku.yml`) is the documented alternative. Free instances have no shell: migrations and backups run from a workstation against the Supabase URL. cron-job.org calls the two scheduler endpoints on `silsila.onrender.com`. The Google OAuth app is in Testing (owner is the test user) until a privacy page exists. Not yet verified: Web Push on real devices, Google Calendar connect.

- Deployment (Render + Supabase path, Heroku alternative, local Docker rehearsal): `docs/engineering/deployment.md`
- Environment variables: `docs/engineering/environment.md`, `.env.example`
- Backup, restore and **personal database migration checklist**: `docs/engineering/backup-restore.md`
- Google client and consent setup: `docs/engineering/google-production.md`
- Notifications and PWA: `docs/engineering/notifications-pwa.md`
- Operations and cron table: `docs/engineering/operations.md`
- Onboarding: `docs/product/onboarding.md`

**Never apply migrations, repairs or seeds to the personal database without a verified backup, and only when the owner runs the checklist deliberately.** Never mix new UTC-pinned writes with an unrepaired legacy database.

## Current next step

Feature development is intentionally paused. Priority order:

1. After the WI-012 merge, the owner runs the one-time runbook from the workstation: verified backup (`PATH=/opt/homebrew/opt/libpq/bin:$PATH pnpm db:backup` + Docker PostgreSQL 17 restore check) → clear the TEST routine and blocks in the app and Sync now → `scripts/reset-owner-data.sql` → deploy → `pnpm db:deploy` → `pnpm roadmap:bundle` → `pnpm roadmap:import` (`docs/engineering/backup-restore.md`, `docs/engineering/operations.md`).
2. Use Silsila daily as the single tracker for 7–14 days and collect friction; verify Web Push on real devices; connect Google Calendar; weekly backup.
3. Small follow-up WI when convenient: a `/privacy` page so the Google app can be published (removes the seven-day Calendar reconnect).
4. AI preparation suggestions were designed and then deferred by the owner (2026-10-21); revisit only after real usage.

Update this section when the phase changes.

## Where to look for details

- Schema: `prisma/schema.prisma`; migrations: `prisma/migrations/`
- Architecture and decisions: `docs/architecture/overview.md`, `docs/architecture/decisions.md`, `docs/architecture/data-flows.md`
- Handbook index: `docs/README.md`
- WI handoffs: `docs/WI-0xx-HANDOFF.md` (latest `docs/WI-010-HANDOFF.md`)
- Security: `docs/engineering/security.md`, `SECURITY.md`
- Product flows and stories: `docs/product/user-flows.md`, `docs/product/user-stories.md`
- Brand: `docs/product/brand-system.md`, `public/brand/README.md`
- Domain code: `src/features/{schedule,execution,dsa,learning,jobs,calendar,review,notifications,push,auth}`
- Contributing rules: `CONTRIBUTING.md`; changelog: `CHANGELOG.md`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
