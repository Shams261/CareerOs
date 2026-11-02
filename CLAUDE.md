# Silsila

Brand: **Silsila** · Domain: **usesilsila.me** · Promise: **Plan once. Show up daily.**

Silsila is a single-owner personal execution system. It turns recurring routines into dated plans, records what actually happened, runs DSA and technical-learning revision, tracks job applications and interview rounds, mirrors dated blocks into a dedicated Google calendar, closes each week with a review, and delivers reminders through an inbox and Web Push. Formerly CareerOS; technical identifiers (package name, database name, cookies, export schema) intentionally still say `careeros`.

This file is a navigation and invariant map. The repository is the source of truth; when in doubt read the schema, services, tests and `docs/`.

If CLAUDE.md conflicts with the implementation, schema, tests, migrations or an accepted ADR, the repository state wins. Call out the discrepancy before changing behavior.

## Current state

- Latest completed work item: **WI-120** (repo cleanup, 2026-11-02, docs and configuration only: the archive tag `docs-archive-2026-11-02` and `docs/HISTORY.md`, old handoffs, screenshots and finished plans off `main`, stale docs fixed, this file slimmed). Before it, WI-099 to WI-119 built Rumi 2 and 3, Rumi's character and the Rumi audit (all 2026-11-01).
- Live at https://usesilsila.me since 2026-10-20 (Render + Supabase, ADR-014). Latest migration: `20261106000000_owner_ai_limit` (WI-114).
- Phase: two weeks of owner UAT of Rumi 2 and 3 with the plan's measures, then the owner's monthly AI limit and hosting choices. Proposed next work items are in `output/Silsila-Full-Audit.pdf` (not committed).
- History: every work item has an entry in `CHANGELOG.md` (cut into versions); the last ten handoffs are in `docs/`, older ones under the tag (`docs/HISTORY.md`). What each feature does and where it lives: `docs/architecture/features.md`.

## Code map

| Area                                                            | Code                                                                             | Decisions                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| Routines, plans, blocks, sessions                               | `src/features/schedule/`, `execution/`                                           | ADR-002, ADR-004, ADR-015 |
| Today                                                           | `src/app/today/`, `src/features/today/`                                          | ADR-019, ADR-027, ADR-028 |
| Plan (`/calendar`)                                              | `src/app/calendar/`, `schedule/week-list.ts`, `schedule/row.ts`                  | ADR-020                   |
| Focus                                                           | `src/app/focus/`, `execution/focus*.ts(x)`                                       | ADR-021                   |
| Close the Day                                                   | `src/features/close-day/`                                                        | ADR-021                   |
| Practice (`/dsa`), revision ladder                              | `src/features/dsa/`, `drills/`                                                   | ADR-006, ADR-025, ADR-029 |
| Roadmap and curriculum                                          | `src/features/roadmap/`, `curriculum/`, `goals/`, `scripts/lib/`                 | ADR-016, ADR-018, ADR-026 |
| Learn (URL only)                                                | `src/features/learning/`, `src/app/learn/`                                       | ADR-007                   |
| Jobs, rounds, formats, funnel                                   | `src/features/jobs/`                                                             | ADR-008                   |
| Prep docs, invite research, debrief, mock                       | `src/features/prep/`                                                             | ADR-024                   |
| Weekly review, Look Back, Day Print                             | `src/features/review/`, `look-back/`, `day-print/`                               | ADR-011, ADR-021          |
| Rumi (chat, tools, writes, cards, memory, lines, voice, mascot) | `src/features/agent/`, `src/app/api/rumi/ask/`                                   | ADR-024, ADR-030, ADR-031 |
| AI engine, Grill Me, Listen, the limit                          | `src/features/ai/`, `listen/`                                                    | ADR-022, ADR-023          |
| Rumi noticed                                                    | `src/features/noticed/`                                                          | —                         |
| Notifications, Study Nudges, push                               | `src/features/notifications/`, `nudges/`, `push/`, `public/sw.js`                | ADR-004, ADR-012          |
| Google Calendar                                                 | `src/features/calendar/`                                                         | ADR-010                   |
| Undo, deletes, notes, command bar                               | `src/features/undo/`, `deletes/`, `notes/`, `command/`                           | —                         |
| Settings, setup steps                                           | `src/app/settings/`, `src/features/settings/`, `setup/`                          | —                         |
| Sign-in, sessions, gate                                         | `src/features/auth/`, `src/server/session.ts`, `src/proxy.ts`                    | ADR-012                   |
| Platform                                                        | `src/server/` (db, memo, health, jobs, export), `src/lib/` (env, time, database) | ADR-009, ADR-017          |

## Architecture

- Next.js 16 App Router (16.4.3 since WI-044), React 19, strict TypeScript, Tailwind 4, Zod 4, date-fns/date-fns-tz, pnpm, Vitest. Build uses `next build --webpack`.
- PostgreSQL 17 via Prisma 7 and `@prisma/adapter-pg`. Migrations are versioned SQL in `prisma/migrations`.
- **Server Components by default.** Client components for navigation state, form feedback, push and voice controls, error recovery and the interactive islands that need them (Focus, the Rumi drawer and chat, the command bar, a roadmap week). No client data stores; browser storage keeps only per-device conveniences.
- Forms use Server Actions and native controls with Zod validation. React Hook Form is not used. `ActionForm` shows the result beside the button; a form whose row disappears after its action passes `broadcast="<channel>"` and a `FeedbackOutlet` mounted outside the row shows the message and Undo (WI-014). Buttons are the shared `Button` (`primary` by default, `secondary`, `destructive`, `small`); dates on screen come from `shortDate`/`weekdayDate` and clock times from `hhmm` (24-hour); a region whose filters navigate wraps itself in `PendingRegion` (WI-015). A row that should flip before the server answers passes `onPending` and `onSettled` to `ActionForm` and reverts when `ok` is false (WI-017); `closeOnSuccess` closes the enclosing `Disclosure`; `toast` shows a refusal as a toast at the bottom of the screen instead of beside the button (WI-081, the launcher and the sidebar card only). An add form passes `draft="<key>"` (and its `Disclosure` the same key) so typed text survives Back and refresh in `sessionStorage` until saved or discarded (WI-018, `src/components/drafts.ts`); a form's less-used fields go behind `FormMore`, never a second `Disclosure`, so they still submit.
- Layout: `src/app` routes and API handlers; `src/features/<domain>` with `domain.ts` (pure rules) and `service.ts` (orchestration and DB writes); `src/server` for db client, sessions, `owner()`, security headers, rate limits, health, jobs, export; `src/lib` for env, time, crypto and validation helpers.
- **Owner scoping:** every page, action and private API calls `owner()` from `src/server/db.ts`, which resolves the signed-in user from the session cookie. Queries are scoped by that id.
- **Notifications:** `NotificationLog` is the durable inbox, filled by `POST /api/notifications/process` (cron). Web Push is a delivery channel on top of it, not a separate engine; the inbox row survives push failure.
- **Google Calendar:** `CalendarConnection` per owner, `TimeBlock` carries the external event id, etag, hash and sync status. Sync runs from cron, manual "Sync now", or a webhook-triggered pass. Only the dedicated calendar is ever read or written.
- Scheduled work is external cron hitting two bearer-protected endpoints. No queues, Redis or workers.
- **Request cost discipline (WI-010):** every statement is a cross-region round trip in production. `currentSession` is request-cached; the Needs attention list on Today sits behind its own Suspense and error boundary and reuses the memoized snapshots; pages load only what the visible step needs; list links do not prefetch and the eight menu links prefetch only on hover, focus or touch (WI-061); the client refresh is five minutes. Read-only snapshots go through `memo()` in `src/server/memo.ts` (three minutes since WI-061, dropped by every write and by every scheduler run except reminders; ADR-017), and `resolveSession` keeps a resolved session for 60 seconds; never cache the day's blocks, sessions or the running session. Measure with PostgreSQL `log_statement` on a local `next start` before adding queries to a page (recipe in `docs/engineering/operations.md`, "Measuring a page's queries").

## Core domain invariants

Violating any of these is a bug, not a design choice.

- `RoutineBlock` (template) → `DailyPlan` (dated) → `TimeBlock` (planned occurrence) → `ActualSession` (what happened). Planned and actual time are separate records; never derive one from the other.
- Editing a dated `TimeBlock` never modifies its `RoutineBlock`. Propagation of a routine **edit** to future occurrences is an explicit, previewed choice. A **newly created** routine is added to already-planned days from today on (future slots only, never replacing or editing an existing block, overlapping slots skipped) so the first routine shows on Today (ADR-015).
- Generation is idempotent (`@@unique([routineKey, occurrenceDate])`); regenerating a day never duplicates or overwrites edited blocks.
- At most one running session per owner (`one_running_session_per_user` partial unique index).
- Automatic generation fills today → Sunday only (`generateThroughSunday`, run when Today or Plan is viewed). Next week is generated by **Prepare next week**, or by the owner's press on a Rumi plan card for a day in it (ADR-031, WI-116). There is no manual "generate" control. Do not reintroduce unconditional 14-day generation.
- `RoutineBlock` never syncs to Google. `TimeBlock` ↔ Google event only. `ActualSession` never syncs. Google edits touch only the dated occurrence.
- Silsila reads and writes only its own app-created calendar (`calendar.app.created`). Events without Silsila private properties are ignored, never mutated.
- DSA (`DsaProblem` → `DsaAttempt` → confidence → revision) and technical learning (`LearningTopic` → activity → mastery → review) are distinct models. Do not merge them or auto-convert other domains into either. `RoadmapItem` may link to either but never writes to them; marking an item done or asked changes the item only.
- `JobApplication` has many `InterviewRound`s. Never model one interview as the application.
- The roadmap never writes to Learn or Practice; marks change the item only (ADR-016/018). An item linked to a `DsaProblem` takes its status from Practice and has no roadmap revision (`followPractice`, ADR-025); the roadmap refuses Done, Start, Reopen and Revised on it. Imported items are keyed by `(roadmapId, slug)`; owner-added items have no slug. An import must never overwrite `status`, `completedAt`, `askedInInterview`, `askedNote`, attempts, confidence, or notes the owner has written.
- The default curriculum (ADR-026) is never deleted and never tied to a goal: `Roadmap.curriculum` rows are archived, not deleted, and keep their name; nothing creates a goal from a bundle; a wipe or reset keeps the curriculum or Restore brings it back.
- Attempts, activities, job activities and stage history are append-only.
- Owner id comes from the server session only. Never accept a user id from the browser.
- Existing migrations are immutable; schema changes get a new migration. Multi-row mutations use transactions and the owner row lock (`locked()` in `schedule/service.ts`, `SELECT … FOR UPDATE` on the `User` row); calendar sync uses the lease on its connection row in `calendar/service.ts`.

## Time and timezone rules

Policy from WI-005.1 / ADR-003 / ADR-009. Read `docs/architecture/decisions.md` before touching anything date-related.

- **Real instants** (`plannedStart`, `startedAt`, `scheduledStart`, `sentAt`, `createdAt`) are `timestamptz`. They are stored as true UTC instants.
- **Calendar labels** (`DailyPlan.date`, `occurrenceDate`, revision and review dates, applied and next-action dates) are PostgreSQL `DATE`. A DATE is a label, never an instant; never convert it through `new Date(...)` UTC arithmetic.
- Every application PostgreSQL session is pinned to `TimeZone=UTC` (`src/lib/database.ts`); startup refuses to run otherwise. Transaction poolers may need `ALTER DATABASE … SET TimeZone = 'UTC'`.
- The owner timezone (`User.timezone`, currently America/Toronto) controls rendering and local-day boundaries. Never use fixed offsets; DST must stay correct.
- A legacy audit and guarded repair exist (`pnpm timestamps:audit`, `pnpm timestamps:repair`). Procedure: `docs/engineering/backup-restore.md`. Never run the repair twice.

## Authentication and security

- One owner. Google OIDC sign-in (PKCE, state, nonce, `openid email`), allowlisted by `OWNER_EMAIL`, verified email only. A database with a different stored owner refuses sign-in rather than creating a second workspace.
- Sessions are server-side rows holding a token hash; the cookie is httpOnly, SameSite=Lax, Secure over HTTPS, 30 days, revoked on sign-out; Settings → Sessions lists live sessions and signs out the other devices (WI-057). `src/proxy.ts` gates every private page and API.
- Google **login** and Google **Calendar** authorization are separate consents. Calendar refresh tokens are AES-256-GCM encrypted with `CALENDAR_TOKEN_ENCRYPTION_KEY`.
- Backups in CI (WI-051) are age-encrypted to the owner's public key before upload, because the repository is public; never upload a plain dump or put a private key in a secret.
- Cron endpoints accept only `Authorization: Bearer $CRON_SECRET`. The calendar webhook validates channel id and token. Nonce CSP, HSTS in production, per-IP rate limits, fail-fast env validation.
- Never log tokens, codes, secrets, keys, job-description text, compensation, reflections or contact details. Log vocabulary is fixed in `docs/engineering/security.md`.

## Brand and UI rules

- Brand **Silsila**, domain **usesilsila.me**. Primary: _Plan once. Show up daily._ Secondary: _Keep the chain going._ Never render the product name as "UseSilsila" except when quoting the URL.
- **Light is the default theme regardless of OS or browser appearance.** Dark is opt-in via Settings and saved in the `silsila-theme` cookie; the server resolves it before render. Only Light and Dark are offered. Text size (WI-087) works the same way: `silsila-text-size` → `html[data-size]`, Default / Large / Larger.
- Tokens live in `src/app/design-tokens.css` (runtime) and `src/assets/design-tokens.json` (handoff). Light (two surfaces since WI-017): canvas `#F4F1EA`, cards `#FFFFFF`, secondary surface `#FBF9F4` (sidebar, inputs), ink `#1B1A16`, secondary ink `#4F4B44`, meta text `#716C63` (`--muted`, metadata only), teal `#1E6B5B`, border `#E6E1D7`, divider `#EFEBE3`. Dark: canvas `#14130F`, cards `#1F1E19`, accent `#4FB59F`. Semantic: success `#347A5C`, warning `#A86F19`, danger `#A94843`, info `#4F7080`; the P0 mark uses the teal tint, no second accent. One card shadow, one floating shadow.
- Voice: direct and factual, restrained (WI-059: the owner wants the gap felt, so Today states yesterday's and the week's counts plainly). Since WI-065 (ADR-027) Today alone adds one short cheer line to its facts, from the fixed lines in `src/features/today/home.ts`, and This week has the app's only progress bar. Since WI-073 (ADR-028) Today's header also greets the owner and shows one chosen public-domain quotation by the part of the day (centred under the date and the clock since WI-098, like the roadmap's goal card) (`src/features/today/daily-line.ts`; never written by a model; off per browser in Settings). No streaks, scores, pace forecasts, guilt or hustle copy (the one exception, by the owner's choice in ADR-029: a Practice revision step whose day passed reads "Missed"); the chain on Today is a record of days with recorded work or a review and must never become a counter, a streak or a comparison. Navigation labels say what you do there: Today, Plan (`/calendar`), Roadmap, Practice (`/dsa`), Jobs, Weekly review (`/review`), Settings, Ask Rumi (`/rumi`, last since WI-060; since WI-111 the round button, Rumi's head, opens Rumi on every page on a phone and a desktop, and ⌘/ or Ctrl+/ toggles it; since WI-115 the owner can hide it or move it to the other corner); Learn (`/learn`) is reachable by URL only; routes are unchanged. User-facing copy never says "dated plan", "occurrence", "override" or "generate": a changed block is "Changed for this day", a manual block is "Added for this day". No muted explanatory paragraph under a form; rules surface as validation messages. One primary action per page, visible; secondary forms open in place through `src/components/disclosure.tsx`, never `<details>`. Since WI-063 a row's less-used actions go in its `MoreMenu` ("⋯"), each page has one next list (For today until WI-092; since then the page's own primary), and confidence is shown as Shaky, Okay or Solid (`confidenceWord`); never show RED/YELLOW/GREEN.
- The supplied logo artwork is authoritative once it arrives in `public/brand/` (pending, see `docs/product/brand-system.md`, "Pending artwork"); do not redraw or approximate the mark or wordmark in code. `src/components/brand.tsx` holds a documented provisional mark and text fallback; `pnpm brand:icons` regenerates the provisional icons.

## Development workflow

Work is delivered as small, focused work items (`WI-XXX`).

Before changing code: inspect the relevant implementation, `prisma/schema.prisma`, existing migrations, existing tests and the relevant docs/ADR; identify the smallest correct change and its architecture impact. Then implement without stopping at the plan.

After implementing: run the verification commands below, update docs and CHANGELOG, write a handoff (`docs/WI-XXX-HANDOFF.md`), and stop. Do not begin the next WI automatically.

**Handoffs:** `docs/` keeps the last ten handoffs plus `docs/WI-012-HANDOFF.md` (the published curriculum links to it). A new handoff removes the oldest of the ten in the same commit (`docs/HISTORY.md`). Keep CHANGELOG entries to what the owner sees plus the migration name; code identifiers belong in the handoff and `docs/architecture/features.md`.

## Commands

```sh
pnpm dev                 # local server; pair with `pnpm google:fake` for sign-in without a real Google client
pnpm lint                # eslint + prettier --check
pnpm typecheck           # prisma generate + next typegen + tsc
pnpm test                # vitest (database tests skipped without TEST_DATABASE_URL)
pnpm test:ci             # all tests; requires TEST_DATABASE_URL = disposable migrated DB
pnpm test:e2e            # after `pnpm build`: Playwright journeys + axe on a fresh silsila_e2e DB with the loopback fakes (WI-052)
pnpm test:e2e:safari     # the same journeys in WebKit, Safari's engine (WI-057)
pnpm build               # prisma generate + next build --webpack
pnpm docs:check          # documentation link check
pnpm db:generate
pnpm db:migrate --name describe_change
pnpm db:deploy
pnpm db:seed             # example data only; never against a personal DB
pnpm exec tsx scripts/verify-seed.ts   # seed idempotency
pnpm timestamps:audit    # read-only
pnpm data:check          # read-only: test/UAT-named records by model and id; exit 1 until clean (Version 2 R1)
pnpm timestamps:repair   # dry-run unless --apply --confirm=<db>
pnpm db:backup
pnpm db:restore:verify <file>          # restores into a new scratch DB, then drops it
pnpm roadmap:bundle "<sources folder>" # study materials → roadmap-bundle.json (needs pdftotext); never committed
pnpm roadmap:import <bundle.json>      # idempotent import for the single owner (DATABASE_URL)
pnpm curriculum:publish <bundle.json>  # WI-064: store the bundle as the default curriculum every workspace gets
pnpm brand:icons                       # regenerate the provisional icons (until the official artwork arrives)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/fresh-start.sql        # WI-045: clear activity and test data, keep curriculum at zero; verified backup first
```

Local quirk: node and pnpm are installed via nvm (`~/.nvm/versions/node/v24.17.0/bin`). Disposable test databases go on the Homebrew PostgreSQL 16 at 5432. The `.env` database on 127.0.0.1:55432 is a second Homebrew instance with its data directory in `/private/tmp`; it holds only the example seed, never personal data. Production rehearsal: `DB_PORT=5433 docker compose --profile app up --build` (see README).

## Testing expectations

- Existing tests are regression contracts. Never delete or weaken a test to make new work pass.
- Full pre-handoff gate: `prisma format`, `db:generate`, `lint`, `typecheck`, `test:ci`, `build`, `test:e2e` (UI work; CI runs it on every push), `docs:check`, `git diff --check`.
- Schema changes additionally need: clean `db:deploy` on a fresh DB, an upgrade test from the previous migration, `prisma migrate diff --exit-code` drift check, and seed run twice.
- Use disposable databases only. Never run migrations, seed, repair or tests against the personal database.
- Meaningful UI work is browser-checked at about 1440px and at 390px: no console errors, no horizontal overflow, no accessibility regressions (axe was clean at WI-008). Local loop: `pnpm google:fake` plus `pnpm dev` against a disposable migrated database (`.env` points at `silsila_dev_empty` on the Homebrew PostgreSQL at 5432 during UI work; restore the seed `.env` from `.env.local-seed-55432.bak` afterwards).

## Production and operations

State as of 2026-10-20: **Silsila is live at https://usesilsila.me** on a Render free web service (Docker image from this repo, Ohio, service `silsila`, auto-deploys `main` after CI passes) with Supabase free PostgreSQL 17 (Canada Central, session pooler, `DATABASE_SSL=no-verify`). ADR-014; Free instances have no shell: migrations and backups run from a workstation against the Supabase URL. cron-job.org calls the two scheduler endpoints on `silsila.onrender.com`. The Google OAuth app is **In production** since 2026-10-24 (`/privacy`, WI-026). Google Calendar is connected and push is enabled on two devices (WI-050); a real iPhone check of Safari, the Home Screen app and push is still the owner's.

- Deployment (Render + Supabase path, local Docker rehearsal): `docs/engineering/deployment.md`
- Environment variables: `docs/engineering/environment.md`, `.env.example`
- Backup, restore and **personal database migration checklist**: `docs/engineering/backup-restore.md`
- Google client and consent setup: `docs/engineering/google-production.md`
- Notifications and PWA: `docs/engineering/notifications-pwa.md`
- Operations and cron table: `docs/engineering/operations.md`
- Onboarding: `docs/product/onboarding.md`

**Never apply migrations, repairs or seeds to the personal database without a verified backup, and only when the owner runs the checklist deliberately.** Never mix new UTC-pinned writes with an unrepaired legacy database.

## Current next step

**Two weeks of UAT** of Rumi 2 and 3 with the plan's measures (rated lines and the fallback share, writes kept versus undone, cards applied versus dismissed, messages by voice, drafts and mocks used); the owner sets the monthly AI limit as they like (none by default, never a hard-coded cap). Owner steps still open: rate ten Rumi lines before turning the afternoon line on, Settings → Voice → Check this device on the iPhone tab and Home Screen app, delete the orphan test events in the Silsila Google calendar, check push and Safari on a real iPhone. The full audit of 2026-11-02 proposes the next items (ops safety: daily backups, a second cron caller, a real monitor; one action runner; kernel modules and boundaries; CSS cleanup); each starts only when the owner says so. One work item at a time; a migration is applied to the personal database before its merge.

## Where to look for details

- Schema: `prisma/schema.prisma`; migrations: `prisma/migrations/`
- Architecture, features and decisions: `docs/architecture/overview.md`, `docs/architecture/features.md`, `docs/architecture/decisions.md`, `docs/architecture/rumi-2.md`
- Handbook index: `docs/README.md`; history and the archive tag: `docs/HISTORY.md`; changelog: `CHANGELOG.md`
- Handoffs: the last ten in `docs/` (latest `docs/WI-120-HANDOFF.md`); the Rumi 2 and 3 plan: `docs/product/rumi2-plan.md`
- Security: `docs/engineering/security.md`, `SECURITY.md`; operations: `docs/engineering/operations.md`; backups: `docs/engineering/backup-restore.md`
- Brand and design principles: `docs/product/brand-system.md`
- Contributing rules: `CONTRIBUTING.md`

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
