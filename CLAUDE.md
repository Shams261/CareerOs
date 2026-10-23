# Silsila

Brand: **Silsila** · Domain: **usesilsila.me** · Promise: **Plan once. Show up daily.**

Silsila is a single-owner personal execution system. It turns recurring routines into dated plans, records what actually happened, runs DSA and technical-learning revision, tracks job applications and interview rounds, mirrors dated blocks into a dedicated Google calendar, closes each week with a review, and delivers reminders through an inbox and Web Push. Formerly CareerOS; technical identifiers (package name, database name, cookies, export schema) intentionally still say `careeros`.

This file is a navigation and invariant map. The repository is the source of truth; when in doubt read the schema, services, tests and `docs/`.

If CLAUDE.md conflicts with the implementation, schema, tests, migrations or an accepted ADR, the repository state wins. Call out the discrepancy before changing behavior.

## Current product state

Latest completed work item: **WI-024** (Weekly review closes the week, 2026-10-23: one header and summary line, a three-step stepper with Details as a utility, day sections with the shared block rows, next-week rows, "Done" and "Recorded, needs update" in Details, the `clock` alias removed), after WI-023 (Roadmap as rows, 2026-10-23: Continue as the overview's primary, goal record lines, roadmap rows and a Due for revision rail, Done as the detail page's only primary, revision pills in Today's words, no bars), after WI-022 (Jobs as moves, 2026-10-23: application rows and the Needs attention rail in Today's words from the shared `src/features/attention/domain.ts`, one primary per application page, round forms in panels, the interview block kept in step with the round), after WI-021 (Plan as days, 2026-10-23: the week as stacked days on the shared block row, a strip of day chips, routines in a side panel, 24-hour times across the app), after WI-020 (Today as an agenda, 2026-10-22: compact launcher, the day as an open list with Earlier / Now / Later, one bounded Needs attention list, the review, chain, notes and attention queue in accessible side panels), after WI-019 (second UAT pass, 2026-10-22: reminders with absolute dates and timestamps, roadmap search scope with matches elsewhere, teal P0 mark), after WI-018 (UAT bigger items, 2026-10-22: Settings in five groups with a left index, the routine editor as a short form with More, drafts for in-place forms kept in the tab's sessionStorage), after WI-017 (UAT follow-through, 2026-10-22: forms that close with Undo above the list, inline required-field messages, a top progress bar, Today's greeting line, chain caption and launcher card with the interview as a timeline row, the roadmap panel order with a sticky action bar, the stage stepper, next-action strip, round date tiles and prep checkboxes on applications, the two-surface token layer, optimistic rows, illustrated empty states, phone timeline with secondary actions behind a toggle), after WI-016 (design review leftovers, 2026-10-22: due-section links, application link after quick add, disconnect flow, `Button` link variant, phone running strip, Jobs rows), after WI-015 (design review rows 11–15, 2026-10-22: dates and copy, page titles, accessibility pass with a shortcuts switch, `Button` everywhere with tokens and merged CSS, `PendingRegion` transitions, error and not-found pages), after WI-014 (design review rows 2–10, 2026-10-22: Done/Revised/Reopen loop, Practice bands, feedback that survives the row with `FeedbackOutlet`, Today hierarchy, reminders in Settings, Jobs forms and vocabulary, review save-and-continue, phone shell, row recipe), after WI-013 (the three P0s, 2026-10-21), WI-012 (the Roadmap as the single study tracker, 2026-10-21), WI-011 (undo, summaries, phone navigation, shortcuts overlay), WI-010 (week chart, motion, notes to self, snapshot cache), WI-009 (UX simplification, roadmap and goals), WI-008 (personal production launch, live since 2026-10-20) and the brand system.

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
- **Goals and roadmap (WI-009):** `Goal` authoring with target dates and live weekly progress; `Roadmap` → `RoadmapItem` (sections, concepts/questions, status, asked-in-interview mark, optional links to Learn topics and Practice problems/topics). A roadmap is a planning layer: it never changes mastery, attempts or revision dates (ADR-016). Today shows the chain (14 days, record not score) in its Activity panel, a live timer and keyboard shortcuts; the running session sits in the shell on every page.
- **Weekly review closes the week (WI-024):** `src/app/review/page.tsx` reads like Today: `reviewSummaryLine` and `dayHeading` in `src/features/review/domain.ts`, `scheduleWeek` items with their sessions and a `needs-update` state, the shared `BlockRowShell` for the week's days, next-week interviews and follow-ups as rows, Details without a second reminder form. `hhmm` is the only clock formatter (`clock` is gone).
- **Roadmap as rows (WI-023):** `src/app/roadmap/page.tsx` shows Continue (`continueTarget`) as its one primary, one `goalLine` per active goal, roadmap rows in the attention recipe and a Due for revision rail from the shared `roadmapRevisionRows`; the detail page keeps Done as its only primary, shows counts as "N done · M left" (no bars, ratios or pace), phrases revision as "Revision overdue by N days", and opens Edit roadmap and Edit item in side panels.
- **Jobs as moves (WI-022):** `src/app/jobs/page.tsx` and `src/app/jobs/[id]/page.tsx` read like Today: `applicationMove` and `pagePrimary` in `src/features/jobs/domain.ts` name the next move and the one primary; the Needs attention rail and Today's share `src/features/attention/domain.ts` (`jobAttentionRows`, `interviewPrepRows`, revision rows, `dueContext`); the side panel is `src/components/side-panel.tsx`. The interview's schedule block follows the round: a result settles it, a reschedule or "Add back to schedule" revives it, a rename renames a block still carrying the generated "Company — Round" title (`scheduleBlockTitle`).
- **Plan as days (WI-021, ADR-020):** `src/app/calendar/page.tsx` renders the week as seven stacked days on the shared block row (`src/features/schedule/row.ts` for `blockResolution`, `resolutionText`, `blockTitle`, `rowMeta`, `blockFacts`; `src/features/schedule/block-row.tsx` for the `li.agenda-row` shell), a strip of day chips and one facts line; routines live in a side panel; acting on a block happens on Today. Times are 24-hour everywhere through `hhmm` in `src/lib/time.ts`.
- **Today as an agenda (WI-020, ADR-019):** `src/app/today/page.tsx` composes `src/features/today/` (pure view models in `domain.ts`: `daySummary`, `launcherState`, `agendaEntries`, `groupAgenda`, `blockResolution`, `attentionItems`). One factual summary line, one launcher with one primary action, the agenda as an open list, one bounded Needs attention list (five rows, a paged panel), and side panels for the review, the chain, notes, block details and the full queue. A linked interview and its block are one row through `TimeBlock.interviewRoundId`; reminders merge into attention rows by the entity in their `dedupeKey` and keep their ids. No ring, no score, no streak; past blocks without a decision read "Not recorded" or "Recorded · Needs update", never missed. Adding something to Today means a row in Needs attention or a new decision.
- **The Roadmap as the tracker (WI-012, ADR-018):** items carry scope, checkpoint, priority (P0–P2), estimate, read-only references, source and an import slug; roadmaps carry a study prompt template and scenarios; **Copy prompt** renders on the client (`src/features/roadmap/study-prompt.tsx`) so the owner studies in Claude or ChatGPT and marks the item here. Filters above eight items; Continue on the overview; Next on Today. Material is imported, never committed: `pnpm roadmap:bundle` (parsers `scripts/lib/roadmap-sources.ts`; researched curriculum as data in `scripts/lib/dsa-curriculum.ts` and `scripts/lib/interview-research.ts`) then `pnpm roadmap:import` (idempotent; keyed by roadmap title, item slug, topic name, problem URL; never overwrites marks, attempts, confidence or owner notes). DSA problems from the bundle are `DsaProblem`s in Practice. `scripts/reset-owner-data.sql` is the one-time production reset. Item notes, references and the bundle are owner material: never logged; in the export. **Revision lives in the roadmap:** Done schedules `nextRevisionAt` (DATE label) 7 days out, Revised moves it to 14/30/60 (`scheduleRevision`), Reopen clears it; Today's "Revise today" card and the `TECHNICAL_REVIEW` reminder read it. **Learn is off the navigation** since WI-012 (routes, data and tests kept; removal is a later decision).

## Architecture

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4, Zod 4, date-fns/date-fns-tz, pnpm, Vitest. Build uses `next build --webpack`.
- PostgreSQL 17 via Prisma 7 and `@prisma/adapter-pg`. Migrations are versioned SQL in `prisma/migrations`.
- **Server Components by default.** Client components only for navigation state, form feedback, push controls and error recovery. No client data stores.
- Forms use Server Actions and native controls with Zod validation. React Hook Form is not used. `ActionForm` shows the result beside the button; a form whose row disappears after its action passes `broadcast="<channel>"` and a `FeedbackOutlet` mounted outside the row shows the message and Undo (WI-014). Buttons are the shared `Button` (`primary` by default, `secondary`, `destructive`, `small`); dates on screen come from `shortDate`/`weekdayDate` and clock times from `hhmm` (24-hour); a region whose filters navigate wraps itself in `PendingRegion` (WI-015). A row that should flip before the server answers passes `onPending` and `onSettled` to `ActionForm` and reverts when `ok` is false (WI-017); `closeOnSuccess` closes the enclosing `Disclosure`. An add form passes `draft="<key>"` (and its `Disclosure` the same key) so typed text survives Back and refresh in `sessionStorage` until saved or discarded (WI-018, `src/components/drafts.ts`); a form's less-used fields go behind `FormMore`, never a second `Disclosure`, so they still submit.
- Layout: `src/app` routes and API handlers; `src/features/<domain>` with `domain.ts` (pure rules) and `service.ts` (orchestration and DB writes); `src/server` for db client, sessions, `owner()`, security headers, rate limits, health, jobs, export; `src/lib` for env, time, crypto and validation helpers.
- **Owner scoping:** every page, action and private API calls `owner()` from `src/server/db.ts`, which resolves the signed-in user from the session cookie. Queries are scoped by that id.
- **Notifications:** `NotificationLog` is the durable inbox, filled by `POST /api/notifications/process` (cron). Web Push is a delivery channel on top of it, not a separate engine; the inbox row survives push failure.
- **Google Calendar:** `CalendarConnection` per owner, `TimeBlock` carries the external event id, etag, hash and sync status. Sync runs from cron, manual "Sync now", or a webhook-triggered pass. Only the dedicated calendar is ever read or written.
- Scheduled work is external cron hitting two bearer-protected endpoints. No queues, Redis or workers.
- **Request cost discipline (WI-010):** every statement is a cross-region round trip in production. `currentSession` is request-cached; the Needs attention list on Today sits behind its own Suspense and error boundary and reuses the memoized snapshots; pages load only what the visible step needs; navigation links do not prefetch; the client refresh is five minutes. Read-only snapshots go through `memo()` in `src/server/memo.ts` (twenty seconds, dropped by every write; ADR-017); never cache the day's blocks, sessions or the running session. Measure with PostgreSQL `log_statement` on a local `next start` before adding queries to a page (recipe in `docs/WI-010-HANDOFF.md`).

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
- Tokens live in `src/app/design-tokens.css` (runtime) and `src/assets/design-tokens.json` (handoff). Light (two surfaces since WI-017): canvas `#F4F1EA`, cards `#FFFFFF`, secondary surface `#FBF9F4` (sidebar, inputs), ink `#1B1A16`, secondary ink `#4F4B44`, meta text `#716C63` (`--muted`, metadata only), teal `#1E6B5B`, border `#E6E1D7`, divider `#EFEBE3`. Dark: canvas `#14130F`, cards `#1F1E19`, accent `#4FB59F`. Semantic: success `#347A5C`, warning `#A86F19`, danger `#A94843`, info `#4F7080`; the P0 mark uses the teal tint, no second accent. One card shadow, one floating shadow.
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
3. The whole-app design review (`docs/design-review/`) is fully implemented: rows 1–15 of `ENHANCEMENTS.md` section F landed in WI-013, WI-014 and WI-015. Nothing from it is pending; new UI work should keep its five principles (section D).
4. Small follow-up WI when convenient: a `/privacy` page so the Google app can be published (removes the seven-day Calendar reconnect).
5. AI preparation suggestions were designed and then deferred by the owner (2026-10-21); revisit only after real usage.

Update this section when the phase changes.

## Where to look for details

- Schema: `prisma/schema.prisma`; migrations: `prisma/migrations/`
- Architecture and decisions: `docs/architecture/overview.md`, `docs/architecture/decisions.md`, `docs/architecture/data-flows.md`
- Handbook index: `docs/README.md`
- WI handoffs: `docs/WI-0xx-HANDOFF.md` (latest `docs/WI-024-HANDOFF.md`); whole-app design review: `docs/design-review/REPORT.md` and `ENHANCEMENTS.md`
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
