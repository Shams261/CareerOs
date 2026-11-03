# Silsila: complete current-state audit

The authoritative audit of the repository as it stands on 2026-11-02, carried out as work item WI-145 on the branch `audit/wi-145-current-state` (from `main` at `70243da`, WI-144). The previous audit (`output/Silsila-Full-Audit.pdf`, 2026-11-02 at `2b60807`, WI-119) is kept unchanged and used only as history; [the traceability report](SILSILA-AUDIT-TRACEABILITY.md) links the two.

**Method.** The application was inventoried from the repository (routes, actions, models, jobs, integrations), read module by module by three review passes (backend and data, security and privacy, code quality and architecture), run as a production build against a disposable database with the loopback fakes for Google and OpenRouter, swept at eight widths in Chromium, Firefox and WebKit, run in development mode to read React's full hydration and nesting warnings, and tested with the full Vitest suite and the Playwright journeys. Production was touched only by read-only public requests (`/api/health`, `/login`, `/privacy`). No migration, seed, repair or write ran against production or the personal database, and no secret was printed.

## 1. Executive summary

Silsila is a well-engineered single-owner application. Its core rules (planned versus actual, owner scoping, the owner lock, idempotent keys, DATE versus UTC instants, append-only history) are enforced in the schema and in tests, and they held under this audit. **No Critical (P0) or High (P1) finding was confirmed.** The audit confirmed 8 Medium (P2) and about 30 Low (P3) findings.

What was wrong:

- Today failed React hydration in every browser: a form sat inside a `<p>`. The page still worked, because React re-rendered it on the client.
- Firefox reported a CSP violation on the four pages that validate forms in the browser.
- A Rumi answer that failed after it had made a change lost the record of that change and its Undo.
- Two job flows could cancel or settle a block while a session ran on it.
- A routine or reminder time inside the spring-forward gap stopped that week's plan generation and the reminder run.
- Several smaller gaps: a calendar run that always failed still looked fresh; one failing daily job stopped the others; an unbounded inbox read; a few actions bypassed the shared error runner; four low-severity security hardenings.

All 8 Medium findings are fixed, each with a regression test that fails on the old code (except UI-2, which the walking journey covers). 26 Low findings are fixed; the rest are documented. Firefox is now a supported test target. One new journey walks every page in all three browsers and fails on any page error, console error or CSP violation.

**Release assessment:** fit for continued production use by its owner. The remaining risks are operational (free tiers, a one-day recovery point, manual device checks), not defects.

## 2. Repository and release state

| Item                       | State                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                     | `audit/wi-145-current-state`, from `main` `70243da` (merge of WI-144, 2026-11-02 18:38 −05:00)                                                                                            |
| Latest completed work item | WI-144 (study with Rumi); this audit is WI-145                                                                                                                                            |
| Released version           | 3.0.0 in `CHANGELOG.md`; WI-120 to WI-144 are Unreleased but deployed (Render deploys green `main`)                                                                                       |
| Version tags               | none; the tags are `baseline/wi-002`, `wi-003-verified`, `wi-004-verified`, `docs-archive-2026-11-02`                                                                                     |
| Production                 | <https://usesilsila.me>, Render (Docker, Ohio) + Supabase (PostgreSQL 17, Canada Central); health on 2026-11-02: `ok`, database `ok`, `UTC`, schema `current`, jobs `ok`                  |
| Schema                     | 43 models, 29 enums, 35 migrations, latest `20261107000000_time_block_plan_index` (WI-140); this audit adds no migration                                                                  |
| Code                       | 386 TypeScript files and about 68,700 lines in `src/` (with CSS); 23 pages, 11 route handlers, 26 Server Action files with 120 exported actions, 90 client components, 31 feature folders |
| Tests                      | 161 Vitest files (887 tests), 21 Playwright journeys plus sign-in                                                                                                                         |
| Docs                       | `CLAUDE.md` (current to WI-144), `docs/` handbook, 31 ADRs, the last ten handoffs                                                                                                         |

Two files were already modified or untracked before this audit started and are not part of it: `next-env.d.ts` (rewritten by `next dev`) and an untracked `AGENTS.md`.

## 3. Complete feature inventory

| Area                     | Discovered functionality                                                                                                                                                | Routes and files                                                                                                         | Important dependencies                                   | Test coverage                                                                                   | Audit status                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Today                    | Greeting and quotation, facts, launcher (start, update earlier, close, let go), agenda, rings, Needs attention, Rumi's line card, add a block, Day Print                | `/today`, `/`, `features/today/`                                                                                         | schedule, execution, jobs, dsa, roadmap, noticed, nudges | domain and database tests; e2e journeys 1–3, 15, 20                                             | Audited; UI-1 fixed                      |
| Plan                     | Week list, weeks around it, routines panel with previewed edits, block edit for a day, Prepare next week, calendar panel                                                | `/calendar`, `features/schedule/`                                                                                        | calendar                                                 | schedule tests; e2e "Plan shows the week"                                                       | Audited                                  |
| Focus                    | Running session: pause, resume, complete, countdown                                                                                                                     | `/focus`, `features/execution/`                                                                                          | schedule                                                 | execution tests; e2e journey 3                                                                  | Audited                                  |
| Close the Day            | Each open block Done / Tomorrow / Let go; a check-in                                                                                                                    | panel on Today, `features/close-day/`                                                                                    | schedule, execution                                      | domain tests; e2e "a past day closes"                                                           | Audited                                  |
| Roadmap                  | Overview, bands, weeks, items (Start, Done, Reopen, Revised, Asked), notes, Ask Rumi card, study prompt, revision deck, default curriculum                              | `/roadmap`, `/roadmap/[id]`, `/roadmap/deck`, `features/roadmap/`, `curriculum/`, `goals/`                               | dsa (follow Practice), agent                             | roadmap tests; e2e journeys 4, 11                                                               | Audited; BE-6 fixed; UI-4 not reproduced |
| Practice                 | Library with one status filter, problems, attempts, the 3/7/14 ladder, missed steps, pattern quiz                                                                       | `/dsa`, `/dsa/[id]`, `/dsa/drill`, `features/dsa/`, `drills/`                                                            | —                                                        | dsa and practice-security tests; e2e journey 5                                                  | Audited; BE-5, BE-17, CQ-16 fixed        |
| Learn                    | Subjects and topics (URL only, not in navigation)                                                                                                                       | `/learn`, `/learn/subjects/[id]`, `/learn/topics/[id]`                                                                   | —                                                        | learning tests; walked by the new journey                                                       | Audited                                  |
| Jobs                     | Applications, duplicate warning, stages and history, rounds, round blocks, results, follow-ups, funnel, invite parsing, formats, debrief                                | `/jobs`, `/jobs/[id]`, `features/jobs/`                                                                                  | schedule, prep, roadmap                                  | jobs and jobs-security tests; e2e journey 6                                                     | Audited; BE-2 fixed                      |
| Prep docs and mock       | Sourced prep doc, mock answers with feedback                                                                                                                            | `/jobs/[id]/prep/[docId]`, `/…/mock`, `features/prep/`                                                                   | ai                                                       | prep tests                                                                                      | Audited (pages swept, not in a journey)  |
| Weekly review            | The week, reflect, plan (priorities, Prepare next week, close), Still open, history, summary by Rumi, Look Back                                                         | `/review`, `/review/look-back`, `features/review/`, `look-back/`                                                         | schedule, notifications, agent                           | review tests; e2e journey 14                                                                    | Audited                                  |
| Settings                 | Account and sessions, Rumi and AI (limit, style, memory, button, voice), reminders and push, calendar panel, appearance, data (export, status, curriculum), setup steps | `/settings`, `features/settings/`                                                                                        | most features                                            | settings tests; e2e "Settings saves the dark theme"                                             | Audited                                  |
| Ask Rumi                 | Drawer on every page and `/rumi`; streaming reads; small writes with Undo; cards; plans; memory; lines; voice (Talk); page context; study cards                         | `/rumi`, `/api/rumi/ask`, `features/agent/`                                                                              | ai, every feature's services                             | agent tests (domain, database, security, writes, cards, memory, page); e2e journeys 7–13, 15–17 | Audited; BE-1, BE-7, SEC-3 fixed         |
| AI engine                | Model calls, ledger, the owner's monthly limit, pinned provider check, Grill Me, Listen                                                                                 | `features/ai/`, `listen/`                                                                                                | OpenRouter                                               | ai tests                                                                                        | Audited; CQ-1, CQ-11 fixed               |
| Notifications            | Durable inbox, reminders, study nudges, Rumi's lines, push delivery, retention                                                                                          | `/api/notifications/process`, `/api/notifications/opened`, `features/notifications/`, `nudges/`, `push/`, `public/sw.js` | schedule, review, agent                                  | notifications, nudges, coach, push tests                                                        | Audited; BE-3, BE-9, BE-13, SEC-4 fixed  |
| Google Calendar          | OAuth, sync with a lease, push and pull, conflicts, webhook, watch channels                                                                                             | `/api/calendar/*`, `features/calendar/`                                                                                  | schedule                                                 | calendar tests with a fake Google                                                               | Audited; BE-8, CQ-5, SEC-2 fixed         |
| Sign-in and sessions     | Google OIDC, allowlisted owner, sessions, sign out other devices                                                                                                        | `/login`, `/api/auth/callback`, `features/auth/`, `server/session.ts`, `proxy.ts`                                        | Google                                                   | proxy and auth tests; e2e sign-in                                                               | Audited; SEC-1 fixed                     |
| Undo, deletes, notes, ⌘K | Undo kinds, deletes with Undo, quick notes, the command bar                                                                                                             | `/api/command`, `features/undo/`, `deletes/`, `notes/`, `command/`                                                       | —                                                        | undo and deletes tests; e2e "⌘K"                                                                | Audited; BE-14 fixed                     |
| Platform                 | Health, export, presence, privacy page, memo cache, job runs, retention, security headers, env validation                                                               | `/api/health`, `/api/export`, `/api/presence`, `/privacy`, `src/server/`, `src/lib/`                                     | —                                                        | production, proxy, retention tests                                                              | Audited                                  |
| Operations               | CI gate, daily encrypted backup, scheduler caller, uptime, weekly WebKit                                                                                                | `.github/workflows/*.yml`, `scripts/`                                                                                    | GitHub                                                   | workflow files read                                                                             | Audited (dashboards not inspected)       |

## 4. Route and workflow coverage

All 23 pages and the login page were loaded signed-in at 320, 360, 375, 390, 430, 768, 1024 and 1440 px in Chromium, Firefox and WebKit: 208 page-widths per browser, 624 in all. This covered `/`, `/today`, `/calendar`, `/roadmap`, `/roadmap/[id]`, `/roadmap/deck`, `/dsa`, `/dsa/[id]`, `/dsa/drill`, `/jobs`, `/jobs/[id]`, the prep doc and its mock, `/review` with each of its steps, `/review/look-back`, `/settings`, `/rumi`, `/privacy`, `/learn` and a subject and topic, `/focus`, and a missing page.

All 11 route handlers were read. The authorisation of each was checked in `tests/proxy.test.ts`, plus new tests for the Rumi route's origin check and the two scheduler routes.

All 120 exported Server Actions were checked by the new per-function boundaries test (`tests/boundaries.test.ts`). Every one passes its errors to `runAction`, `failure` or `unstable_rethrow`, except nine listed with reasons: redirects to Google or the login, a read for the composer, and five per-browser cookies.

Workflows exercised end to end: the 21 journeys. The new one walks every page, including those no other journey opens: `/roadmap/deck`, `/dsa/drill`, `/review/look-back`, `/learn` and `/privacy`.

## 5. Architecture findings

The architecture is a **modular monolith with a layered core** (see [the architecture document](../architecture/SILSILA-ARCHITECTURE.md)):

- one container and one database;
- 31 feature folders, each with pure `domain.ts` and owner-scoped services;
- a kernel that imports no feature;
- pages that read only through loaders.

`tests/boundaries.test.ts` enforces all of these. There are no file-level import cycles. 13 feature pairs still import each other (the list may only shrink); `schedule` and `agent` are the hubs.

- **ARCH-1 (P3):** 13 two-way feature pairs remain, for example `calendar ↔ schedule`, `agent ↔ jobs` and `notifications ↔ review`. Deferred: shrinking them is churn without user value unless done when those modules are next touched.
- **ARCH-2 (P3):** two functions are named `isFocusCategory`. One is in `lib/categories.ts` and takes the owner's study list; the other is in `schedule/domain.ts` and takes a fixed set. Behaviour is consistent today; the naming invites a mistake. Deferred.

## 6. Code quality findings

- TypeScript is strict, with 0 type errors, 0 lint problems and 0 unused exports (knip), and no `any` escapes found in this pass.
- The domain and service split is consistent.

| ID         | Sev | Finding                                                                                                                                                                                                                                                     | Status                                                                                                                |
| ---------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CQ-1       | P2  | Five AI actions (`grillAction`, `listenAction`, `prepAction`, `draftWeekAction`, `weekSummaryAction`) caught every error, including Next's sign-in redirect, and `weekSummaryAction` logged nothing; the boundaries test checked per file, not per function | Fixed: `unstable_rethrow` first in each catch, the summary logs `[agent] summary failed`, and a new per-function test |
| CQ-2       | P3  | `readNotificationAction` and `rumiStyleAction` had no error handling (an error page instead of a message)                                                                                                                                                   | Fixed: `runAction` and `failure`                                                                                      |
| CQ-5       | P3  | Silent catches: a failed plan generation inside the calendar sync, and a thrown webhook sync                                                                                                                                                                | Fixed: logged by class                                                                                                |
| CQ-11      | P3  | Listen's "fetched" time used the browser locale                                                                                                                                                                                                             | Fixed: fixed `en`, 24-hour                                                                                            |
| CQ-12      | P3  | Dates checked by shape only (`/^\d{4}-\d{2}-\d{2}$/`) in 12 Zod schemas, so `2026-02-30` passed                                                                                                                                                             | Fixed: `z.iso.date()`                                                                                                 |
| CQ-13      | P3  | The per-browser cookie options were copied in four files                                                                                                                                                                                                    | Fixed: `browserCookie()` in `src/lib/cookie.ts`, with a test                                                          |
| CQ-15      | P3  | Doc drift: `CLAUDE.md` lists `isDay` (the export is `checkDay`); the log vocabulary named `[agent] summary failed`, which nothing logged                                                                                                                    | Fixed                                                                                                                 |
| CQ-16      | P3  | The Practice filter's client component pulled Zod into the browser only for a constant                                                                                                                                                                      | Fixed: `STATUS_FILTERS` in `dsa/words.ts`; the allowlist shrank by one                                                |
| CQ-3       | P3  | Some actions hand-roll their revalidation instead of the runner's                                                                                                                                                                                           | Deferred                                                                                                              |
| CQ-6, CQ-7 | P3  | Pairs removable by importing `AGENT_NAME` from `@/lib/rumi`; service tangles                                                                                                                                                                                | Deferred (ARCH-1)                                                                                                     |
| CQ-8       | P3  | Study categories read in several places with different fallbacks                                                                                                                                                                                            | Checked: no behaviour difference (see ARCH-2); deferred                                                               |
| CQ-9       | P3  | A few small pages still compose without a `page-data` loader of their own                                                                                                                                                                                   | Deferred                                                                                                              |
| CQ-10      | P3  | 46 inline plurals instead of `plural()`                                                                                                                                                                                                                     | Deferred                                                                                                              |
| CQ-14      | P3  | Functions kept alive only by their tests (`goalLine`, `executionLabel`, `blockSummary` and others)                                                                                                                                                          | Deferred: removing them means removing tests, which the project's rules reserve for the owner                         |
| CQ-17      | P3  | Test harness set-up duplicated across database suites                                                                                                                                                                                                       | Deferred                                                                                                              |

## 7. Backend and API findings

| ID           | Sev | Finding                                                                                                                                                           | Root cause                                                                                                                          | Status and evidence                                                                                                                                                                                                                                                              |
| ------------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE-1         | P2  | A Rumi answer that failed after a small write (a note, a block, a rest day) lost the action and its Undo; the owner saw "couldn't answer" while the change stayed | `sendMessage` threw out of the tool loop before the answer, which carries the actions, was stored (`src/features/agent/service.ts`) | Fixed: a failure after a change stores a plain answer ("Done so far: … Undo is on the card below.") with the actions; `tests/agent-writes-database.test.ts` (fails on the old code)                                                                                              |
| BE-2         | P2  | Recording an interview result or deleting an application could cancel or settle a block while a session was running on it                                         | `settleScheduleBlock` and `dropBlocks` did not check for an open session, unlike `deleteBlock`                                      | Fixed: both refuse with "Pause the running session on this interview's block first." and the transaction rolls back; `tests/jobs-database.test.ts` (fails on the old code)                                                                                                       |
| BE-3         | P2  | A routine or reminder time inside the spring-forward gap (02:00–03:00 in Toronto) threw, stopping that week's generation and the reminder run                     | `localInstant` refuses a non-existent wall time, which is right for typed input but wrong for repeated settings                     | Fixed within ADR-003 (never shift a time into a plan): a routine in the gap is left out of that one day (`wallTimeExists`); thresholds (reminder, nudge and stop times, day bounds) use `repeatedInstant`, reached when the clock jumps; ADR-003 amended; `tests/domain.test.ts` |
| BE-4         | P3  | Two overlapping scheduler calls could rarely send one push twice                                                                                                  | Rows are read, then sent, without a claim                                                                                           | Deferred (ROADMAP)                                                                                                                                                                                                                                                               |
| BE-5         | P3  | Settling lapsed revisions (outside the owner lock, on a read) could overwrite a step an attempt had just moved                                                    | Unconditional update                                                                                                                | Fixed: the update is guarded on the step it read                                                                                                                                                                                                                                 |
| BE-6         | P3  | A double press of Revised on a roadmap item moved the ladder twice                                                                                                | No same-day guard                                                                                                                   | Fixed: one revision a day; `tests/roadmap-database.test.ts` (fails on the old code)                                                                                                                                                                                              |
| BE-7         | P3  | Rumi's memory expiry and its once-a-day stamp used UTC days                                                                                                       | `toISOString().slice(0, 10)` and a UTC midnight                                                                                     | Fixed: the owner's day; `tests/agent-memory-database.test.ts` (fails on the old code)                                                                                                                                                                                            |
| BE-8         | P3  | A calendar run where every connection failed was recorded as a success, so the job never looked stale                                                             | `recordRun` saw no throw                                                                                                            | Fixed: recorded as `SyncFailed` while the endpoint still answers 200; `tests/scheduler-routes.test.ts`                                                                                                                                                                           |
| BE-9         | P3  | One `try` covered the four daily jobs, so one failure skipped the rest                                                                                            | Shared block                                                                                                                        | Fixed: each runs and logs on its own; `tests/scheduler-routes.test.ts`                                                                                                                                                                                                           |
| BE-10, BE-11 | P3  | Undo is not idempotent for every kind, and a multi-step Undo is not atomic everywhere                                                                             | Per-kind implementations                                                                                                            | Deferred (ROADMAP)                                                                                                                                                                                                                                                               |
| BE-12        | P3  | No index on `ActualSession.taskId`, `DsaAttempt.actualSessionId`, `LearningActivity.actualSessionId`                                                              | Not added with the relations                                                                                                        | Deferred: needs a migration applied to the personal database first (ROADMAP)                                                                                                                                                                                                     |
| BE-13        | P3  | Needs attention read every unread reminder without a limit                                                                                                        | No `take`                                                                                                                           | Fixed: the newest 50; `tests/today-reads-database.test.ts`                                                                                                                                                                                                                       |
| BE-14        | P3  | `restore()` accepted `toString` or `constructor` as an undo kind (`kind in kinds`); `restore-memory` took any string as a date                                    | Prototype keys; loose schema                                                                                                        | Fixed: `Object.hasOwn`, `z.iso.date()`; `tests/undo-database.test.ts`, `tests/agent-memory-database.test.ts`                                                                                                                                                                     |
| BE-15        | P3  | The reminder loop re-reads the day's plan per preference                                                                                                          | Loop structure                                                                                                                      | Deferred (ROADMAP)                                                                                                                                                                                                                                                               |
| BE-16        | P3  | Rumi's afternoon line could appear in Needs attention as well as on its own card                                                                                  | `STUDY_MIDDAY` (WI-101) was missing from the exclusion list                                                                         | Fixed; `tests/today-reads-database.test.ts`                                                                                                                                                                                                                                      |
| BE-17        | P3  | `/dsa?status=toString` passed the filter check (`in`)                                                                                                             | Prototype keys                                                                                                                      | Fixed: `Object.hasOwn`                                                                                                                                                                                                                                                           |

HTTP contracts hold: private APIs answer 401 without a session, cron endpoints 401 without the bearer, the Rumi route 403 for a missing, foreign or malformed `Origin` (now never a 500), and 400 for an invalid body.

## 8. Database findings

- Relationships, cascades and constraints match the domain rules. Owner rows cascade from `User`; cross-record links use `SET NULL`. CHECK constraints guard ordering, completion and ranges.
- Unique keys make every retried write idempotent, and a partial unique index allows one running session.
- Migrations are immutable SQL. CI checks drift and runs an upgrade test.
- No N+1 pattern of concern was found on the main pages; reads are batched per page loader.
- The only findings are BE-12 (three missing indexes, deferred because they need a migration), BE-13 (an unbounded read, fixed) and BE-5 (a guarded update, fixed).
- Time integrity: DATE labels and `timestamptz` instants are used consistently, every session is pinned to UTC, and the legacy repair is guarded and was not run. DST no longer stops generation or reminders (BE-3), without ever shifting a planned time (ADR-003).

## 9. Security findings

No Critical, High or Medium vulnerability was found. The controls:

- Google OIDC with PKCE, state and nonce, allowlisted to one owner.
- Hashed server sessions with revocation.
- A nonce CSP with `strict-dynamic`, HSTS, frame denial and no sniffing; production headers were confirmed by a read-only request.
- Bearer-protected cron and a verified webhook.
- Owner scoping in every query, covered by six security suites.
- Encrypted calendar tokens.
- No high or critical advisories (`pnpm audit --prod`).

| ID    | Sev (security)     | Finding                                                                                                                                                                       | Status                                                                                                                       |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SEC-1 | Low                | `/api/health` is public and runs several database reads, with no rate limit                                                                                                   | Fixed: 120 a minute per address; `tests/proxy.test.ts`                                                                       |
| SEC-2 | Low                | AES-256-GCM decryption did not pin the tag length, so a shortened tag (a prefix of the real one) was accepted; this applies to calendar refresh tokens and the sign-in cookie | Fixed: a 12-byte IV and a 16-byte tag required, `authTagLength: 16`; `tests/calendar-domain.test.ts` (fails on the old code) |
| SEC-3 | Low                | A malformed `Origin` on `/api/rumi/ask` threw a 500 instead of a 403                                                                                                          | Fixed: `URL.canParse`; `tests/rumi-route-origin.test.ts` (fails on the old code)                                             |
| SEC-4 | Low                | A push subscription could name any HTTPS host, which the server then posts to; this is reachable only with the owner's session                                                | Fixed: the browsers' push services only; `tests/production-unit.test.ts`                                                     |
| SEC-5 | Info (owner check) | The public `/privacy` page shows one Gmail address, from `PRIVACY_CONTACT_EMAIL` or, if that is unset, `OWNER_EMAIL`                                                          | Owner to confirm it is the intended public contact                                                                           |
| SEC-6 | Low                | Prep docs are written from fetched web text, and a later Rumi conversation may read them; Rumi's small writes are bounded (ids it has read, two per answer, Undo)             | Accepted; documented                                                                                                         |
| SEC-7 | Low                | Rate limits are per process and keyed by `CF-Connecting-IP`                                                                                                                   | Accepted for one instance (ADR-014)                                                                                          |
| SEC-8 | Low                | `DATABASE_SSL=no-verify`: TLS without certificate verification                                                                                                                | Deferred (ROADMAP)                                                                                                           |

## 10. Privacy findings

- Rumi and the AI features never read notes, check-in notes, interview reflections, compensation, contacts or job descriptions (`tests/agent-database.test.ts` plants markers in every such field). Blocks outside study and job search show only as busy.
- The provider is pinned with zero data retention and `data_collection: deny`, and is checked daily.
- Push text is generic.
- Logs hold classes, codes and counts only (`docs/engineering/security.md`).
- Retention prunes system records (WI-134), and the export includes Rumi's settings.
- Voice recognition is the browser's own, behind an explicit consent.
- SEC-5 is the only open privacy item.

## 11. NFR assessment

| #   | Requirement                 | Current implementation                                                         | Evidence                                                                                                                                               | Gaps and risks                                                      | Recommendation                      | Status  |
| --- | --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------- | ------- |
| 1   | Security                    | OIDC + PKCE, hashed sessions, CSP, HSTS, owner scoping, encrypted tokens       | Security suites, proxy tests, production headers, `pnpm audit`                                                                                         | In-process rate limits; TLS no-verify                               | Verify the DB certificate           | Pass    |
| 2   | Reliability                 | Owner lock, unique keys, idempotent cron, partial-failure handling             | Database tests; BE-1/2/3/8/9 fixed with tests                                                                                                          | Push claim, Undo atomicity                                          | ROADMAP items                       | Partial |
| 3   | Availability                | One free instance, external monitor, health with job freshness                 | Production health `ok`                                                                                                                                 | A sleeping instance; no SLA measured                                | Paid tier after UAT                 | Partial |
| 4   | Performance                 | Statement budgets, a three-minute snapshot cache, streaming, Zod off the shell | Local build: TTFB about 5 ms, load 30–49 ms; JS 184–203 KB compressed per page; production `/api/health` 0.10–0.36 s, `/login` first byte about 0.04 s | Signed-in production timings not measured; cross-region round trips | One region                          | Partial |
| 5   | Maintainability             | Feature modules, kernel, boundaries test, knip, strict types                   | 0 type errors, 0 lint, 0 unused exports                                                                                                                | 13 feature pairs; a 9,400-line `app.css`                            | Move pages to Tailwind when touched | Pass    |
| 6   | Usability                   | One primary action per page, Undo, plain words                                 | UX review; journeys                                                                                                                                    | Owner UAT pending                                                   | Two weeks of UAT                    | Partial |
| 7   | Accessibility               | Semantic HTML, labels, focus, reduced motion                                   | axe (WCAG 2.2 AA) clean in 3 browsers, light and dark; touch targets fixed                                                                             | No screen-reader run                                                | One VoiceOver pass                  | Partial |
| 8   | Compatibility               | Chromium, Firefox, WebKit                                                      | 22/22 journeys in each; sweep in each                                                                                                                  | No real device                                                      | Owner iPhone check                  | Partial |
| 9   | Data integrity              | Constraints, transactions, append-only history, UTC sessions                   | Schema, migration and DST tests                                                                                                                        | Three missing indexes (performance, not integrity)                  | BE-12                               | Pass    |
| 10  | Recoverability              | Daily encrypted backup with a restore check                                    | Workflow file; runbook                                                                                                                                 | RPO one day; RTO not measured                                       | Time the drill                      | Partial |
| 11  | Observability               | Health with job freshness, logged references, Server-Timing auth               | Code; runbook                                                                                                                                          | No error tracking                                                   | Scrubbed error capture              | Partial |
| 12  | Privacy                     | Field exclusions, ZDR, generic push, retention                                 | Tests with planted markers                                                                                                                             | SEC-5                                                               | Owner check                         | Pass    |
| 13  | Operational simplicity      | One container, two cron endpoints, no queues                                   | Repository                                                                                                                                             | —                                                                   | —                                   | Pass    |
| 14  | Scalability (for one owner) | Owner-scoped queries, bounded reads                                            | Code                                                                                                                                                   | Not designed for many users                                         | None needed                         | Pass    |

## 12. UI/UX findings

The product's recipe holds:

- one primary action per page;
- a row's other actions behind ⋯;
- Undo instead of confirmation;
- plain copy without streaks or scores;
- Light by default, Dark by choice, the tokens followed.

Navigation is unchanged (Today, Plan, Roadmap, Practice, Jobs, Weekly review, Settings, Ask Rumi). Learn stays out of it.

- **UI-1 (P2):** Today failed hydration in every browser (React error #418). Root cause: the launcher's "next" line was a `<p>`, and in the "quiet yesterday" state it holds the _Let go of yesterday's blocks_ form; a form inside a `<p>` is invalid HTML, so the server and client trees differed. Fixed with a `<div>` (`src/features/today/launcher.tsx`); computed styles are unchanged. The new journey fails on the old code with React error #418 on `/today` and passes with the fix.
- **UI-2 (P3):** Firefox reported "blocked a JavaScript eval" on `/roadmap/[id]`, `/dsa`, `/dsa/[id]` and `/jobs/[id]`. Root cause: Zod 4 probes `new Function("")` once to decide on a fast path; the CSP blocks it and Firefox reports even the caught attempt. Fixed: Zod's `jitless` is set before any page code runs (`src/instrumentation-client.ts`, through Zod's global config, so the shell stays free of Zod). The final Firefox sweep shows no errors.
- **UI-3 (P3):** two touch targets were under 24 px on phones (Rumi's hide button at 22 px, the nudge card's "Yes" at 23 px). Fixed.
- **UX-1 (P3, observation):** standalone text links such as "Connect in Settings" are 20 px tall. They pass WCAG 2.5.8 through its spacing exception; kept.

## 13. Mobile findings

- No horizontal overflow and no off-screen element on any of the 25 routes at 320–430 px in any browser.
- The phone navigation, dialogs, the Rumi drawer and the roadmap were all checked.
- **UI-4, the Roadmap markers on mobile: not reproduced.** The overview bands, the week rows and the item status markers were checked at 320 and 390 px in Chromium and WebKit, with a roadmap of 8 sections × 6 items in mixed states (not started, in progress, done, revision due) in an earlier pass of this audit. The markers sit consistently inside their rows (status icons at the same x position, 20 px), with no clipping, overflow or overlap with text. The outline dots and connecting line of the old roadmap (WI-084) were replaced by status icons in WI-088.
  - No code change was made, and no regression test was written for a defect that could not be shown.
  - If the owner still sees it on a device, a screenshot with the device, browser and roadmap would let it be reproduced. The problem may be specific to iOS Safari, which emulation does not cover.

## 14. Accessibility findings

- axe (WCAG 2.0/2.1/2.2 A and AA tags) runs on the journeys' pages in three browsers, including dark theme and the Large text size, with no violations.
- Dialogs have accessible names, focus returns to the opening button, and Escape closes the Rumi drawer before anything behind it.
- Reduced motion is honoured.
- Touch targets were fixed (UI-3).
- Not verified: a screen-reader walkthrough and contrast in states that no journey reaches.

## 15. Performance findings

**Measured locally** (production build, local database, warm cache):

- server first byte 4–6 ms;
- load event 30–49 ms;
- JavaScript per page 184–203 KB compressed, in 17–20 scripts. The public `/privacy` page ships 184 KB, down from about 217 KB in the previous audit, because Zod left the shell (WI-123).

**Measured in production** (read-only):

- `/api/health` answered in 0.10–0.36 s over five requests (it runs several database reads across regions);
- `/login` first byte about 0.04 s.

**Not measured:** signed-in production pages, and memory use on Render.

The design keeps the statement count low because every statement crosses from Ohio to Canada Central. The main levers are already in place: a request-cached session, the snapshot cache, a streamed attention list, and generation skipped by a single count.

## 16. Browser compatibility

| Browser  | Journeys (22) | Sweep (208 page-widths)             | Notes                                                                                                                                          |
| -------- | ------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium | 22 passed     | 0 overflow; only the deliberate 404 | Runs on every push in CI                                                                                                                       |
| Firefox  | 22 passed     | 0 problems                          | New target (`pnpm test:e2e:firefox`); the CSP and hydration errors fixed                                                                       |
| WebKit   | 22 passed     | 0 overflow; only the deliberate 404 | One flaky race in "a move card is applied and undone" (a URL replace after the answer cut a later `page.goto`) seen once and fixed in the test |

Emulation only; no physical device was used.

## 17. Test coverage

- **Vitest:** 161 files and 887 tests on a fresh disposable database, all passing. Statement coverage is 53.5%, branches 44.7%, functions 47.8% and lines 54.0% (unit and database tests only; client components are exercised by the journeys).
- **Playwright:** 22 tests (sign-in and 21 journeys) with axe, in three browsers.
- **Added by this audit:**
  - Rumi keeps a change when the model stops;
  - interview blocks under a running session;
  - DST repeated times;
  - memory by the owner's day;
  - a double Revised;
  - the health rate limit;
  - the shortened GCM tag;
  - the Rumi origin check;
  - push hosts;
  - the scheduler routes;
  - the bounded attention read;
  - undo kinds;
  - the cookie helper;
  - per-function action handling;
  - the every-page journey.
- **Gaps:**
  - component tests for `ActionForm` and the side panels;
  - the prep-doc and mock pages and Learn in a journey (they are walked but not exercised);
  - real Google and push integration tests (fakes only).

## 18. Bugs found

UI-1, UI-2, UI-3, BE-1, BE-2, BE-3, BE-5, BE-6, BE-7, BE-8, BE-9, BE-13, BE-14, BE-16, BE-17, CQ-1, CQ-2, CQ-5, CQ-11, CQ-12, SEC-1, SEC-2, SEC-3, SEC-4. The test-only flake in the WebKit move-card journey is also listed here. Severity, root cause and evidence are in sections 6, 7, 9 and 12.

## 19. Fixes implemented

| Area                   | Files                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration              | `src/features/today/launcher.tsx`                                                                                                                                                                                                         |
| Zod under CSP          | `src/instrumentation-client.ts`                                                                                                                                                                                                           |
| Touch targets          | `src/app/app.css`, `src/features/nudges/card.tsx`                                                                                                                                                                                         |
| Rumi partial failure   | `src/features/agent/service.ts`, `write-domain.ts`                                                                                                                                                                                        |
| Running session guards | `src/features/jobs/round-blocks.ts`, `src/features/deletes/service.ts`, `deletes/domain.ts`                                                                                                                                               |
| DST                    | `src/lib/time.ts` (`repeatedInstant`), `schedule/domain.ts`, `notifications/*`, `nudges/*`, `review/domain.ts`, `jobs/domain.ts`, `close-day/domain.ts`, `learning/domain.ts`, `look-back/service.ts`, `ai/domain.ts`, `app/dsa/page.tsx` |
| Scheduler routes       | `src/app/api/calendar/sync/route.ts`, `src/app/api/notifications/process/route.ts`, `src/app/api/calendar/webhook/route.ts`, `src/features/calendar/sync.ts`                                                                              |
| Data guards            | `src/features/dsa/service.ts`, `src/features/roadmap/service.ts`, `src/features/agent/memory-service.ts`, `src/features/today/reads.ts`, `src/features/undo/service.ts`                                                                   |
| Actions                | `src/server/actions.ts`, `src/features/{ai,listen,prep,agent}/actions.ts`                                                                                                                                                                 |
| Security               | `src/proxy.ts`, `src/lib/token-crypto.ts`, `src/app/api/rumi/ask/route.ts`, `src/features/push/domain.ts`                                                                                                                                 |
| Consistency            | `src/lib/cookie.ts` and four actions, `z.iso.date()` in eight files, `src/features/dsa/words.ts`, `src/features/listen/listen.tsx`                                                                                                        |
| Tests and tooling      | `tests/*` (new and extended), `e2e/journeys.spec.ts`, `playwright.config.ts`, `package.json` (`test:e2e:firefox`), `scripts/architecture-pdf.mjs`                                                                                         |

## 20. Deferred issues

ARCH-1, ARCH-2, CQ-3, CQ-6, CQ-7, CQ-8, CQ-9, CQ-10, CQ-14, CQ-17, BE-4, BE-10, BE-11, BE-12 (a migration), BE-15, SEC-6, SEC-7, SEC-8, UX-1. Each is ranked in [ROADMAP.md](../product/ROADMAP.md).

## 21. Unverified areas

- Real Google sign-in and Calendar sync on the owner's account; only the fake Google ran.
- Real Web Push delivery to devices; no notification was sent.
- iPhone Safari and the Home Screen app, voice recognition on devices, and the Roadmap markers on a real phone.
- The Render, Supabase, cron-job.org and Better Stack dashboards; their settings come from the runbooks.
- Restore time; the drill was not run.
- Signed-in production performance; memory use.
- A screen-reader walkthrough.
- The OpenRouter provider in production (the daily check runs there; this audit used the fake).

## 22. Production and operational risks

1. **Free tiers:** a sleeping instance, 0.1 CPU, a 500 MB database, and the app and database in different regions.
2. **A one-day recovery point.** The daily dump is the only copy, and the restore time is unmeasured.
3. **TLS to the database without certificate verification.**
4. **In-process rate limits and cache:** correct for one instance only.
5. **Manual device checks** for push and voice.
6. **Feature pace:** the previous audit recommended a two-week freeze for UAT, and three feature items (WI-142 to WI-144) shipped the same day. The measures that would show what is used are still unread.

## 23. Overall release assessment

**Ready for continued production use by its owner, with the WI-145 fixes merged.**

- No P0 or P1 defect exists. All P2 defects are fixed with regression tests.
- The code passes typecheck, lint, knip, 887 unit and database tests, and the build. The journeys pass in Chromium, Firefox and WebKit, and the sweep is clean at eight widths in all three browsers.
- What remains before a "3.1.0" is not code. It is the owner's checks: the privacy contact, the iPhone, a timed restore. Then two weeks of use read through the measures before any new feature.
