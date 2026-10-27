# Architecture decision records

All records below describe accepted implementation decisions as of WI-002. Add a superseding ADR when changing an invariant; include alternatives, migration effects and evidence in the PR.

## ADR-001 — Modular monolith and PostgreSQL ownership

**Context:** One owner needs durable personal execution data with a small operational footprint.

**Decision:** Use one Next.js application and PostgreSQL through Prisma. Keep pure domain rules, transaction services and UI boundaries separate. Use Server Components by default and Server Actions for mutations.

**Alternatives considered:** Browser-only storage cannot meet durability; microservices and distributed queues have no demonstrated need.

**Consequences:** Simple deployment and transactions; database availability is required. Horizontal app scaling still needs connection budgeting and load evidence. The existing model is not ready for multiple tenants merely because records contain user IDs.

## ADR-002 — Templates, snapshots and actual work are separate

**Context:** Changing a routine must not destroy manually adjusted days or measured effort.

**Decision:** Weekly templates generate dated snapshots. Preserve original occurrence identity across moves; mark overrides; retain cancellation rows. Actual sessions store their own timestamps and derive duration. Future propagation is previewed and version-checked.

**Alternatives considered:** Live-rendering every day from the current template would rewrite history. Copying planned duration into actual work would invent measurements.

**Consequences:** More explicit user actions and metadata, but predictable history. Ungenerated historical days use the current template; effective-date schedule versioning is future work.

## ADR-003 — Local calendar dates, UTC execution instants

**Context:** Toronto DST and overnight work must not depend on the server's timezone.

**Decision:** Store calendar dates as SQL dates, instants as `timestamptz`, and weekly clock times as validated local HH:mm. Reject nonexistent local times. Select the earlier Toronto occurrence during fall-back.

**Alternatives considered:** Fixed UTC offsets break DST; silently shifting a nonexistent time changes the user's plan.

**Consequences:** 23/25-hour days work, but selecting the second repeated hour needs future UI. Show the timezone at entry points and preserve existing instants if profile preferences later change.

## ADR-004 — Transaction locks and durable inbox scheduling

**Context:** Multiple tabs and cron requests can race.

**Decision:** Serialize execution/schedule/notification mutations using a user-row transaction lock. Enforce a single running session with a partial unique index. Deduplicate notification records with unique occurrence keys. Use an external authenticated cron caller.

**Alternatives considered:** Browser timers do not run reliably when closed; process-local locks cannot coordinate multiple app instances.

**Consequences:** Correct single-owner coordination without a new service. Long propagation can hold the lock, so measure before increasing the planning horizon. Inbox deduplication is not an exactly-once Web Push protocol. Full push delivery needs subscriptions, an outbox and retry policy.

## ADR-005 — Minimal private access gate, with explicit growth limits

**Status:** Superseded by [ADR-012](#adr-012--single-owner-google-sign-in-server-sessions-and-web-push-wi-008) (WI-008). Kept for history.

**Context:** The initial deployment is a private single-owner workspace.

**Decision:** Use configured owner Basic Auth plus a separate cron bearer secret, exclusively behind HTTPS in production. Keep credentials server-side and scope mutations to the owner.

**Consequences:** No account onboarding, sessions, MFA, per-user audit trail or tenant boundaries. A public multi-user product requires an authentication/security design and migration before launch. The gate is not a claim of completed security assurance.

## ADR-006 — Append-only DSA attempts and local revision dates (WI-003)

**Context:** Overwriting confidence loses learning history; timestamp-based due queries can miss a user's calendar boundary. Existing WI-001 data includes summary-only attempts.

**Decision:** Add DsaAttempt history and a bounded revisionStage summary. Under the existing owner-row lock, validate ownership/confidence, deduplicate by `(userId, requestId)`, insert an attempt and update its problem atomically. Only an active owned DSA session is linked. Use PostgreSQL DATE for revisions and owner-local day labels for comparisons; convert legacy instants with the owner's timezone in a new migration. Preserve legacy counts, confidence and last-attempt timestamps without fabricating history. Red/Yellow reset progression; Green intervals are 7/14/30 capped at 30. Manual dates carry a boolean marker until the next attempt.

**Alternatives considered:** Deriving everything from history cannot faithfully reconstruct legacy attempts. Event sourcing and generic learning engines exceed WI-003. UTC-day due comparisons conflict with local scheduling.

**Consequences:** The current-topic reference on User structurally permits at most one current topic. Existing shared DsaTopic catalog and status enum remain; PAUSED is added, NEEDS_REVISION is displayed as Revising. Topic tenancy must be redesigned for multiple real owners. App writes preserve history, but privileged database maintenance can still change it. Dates survive timezone changes as calendar labels; attempt timestamps remain instants. Rollback across the date-column conversion requires schema compatibility review, not simply checking out the old tag.

## ADR-007 — Concept mastery is distinct from DSA confidence (WI-004)

**Context:** Understanding a technical topic does not demonstrate later recall, practical application or interview explanation. WI-001 already stores LearningTopic trees and Resource links.

**Decision:** Reuse LearningTopic/Resource; add owner-scoped LearningSubject and append-only LearningActivity. Reuse LearningStatus (`NEEDS_REVISION` is displayed as “Needs review”), owner-row locks, request IDs and SQL calendar dates. A subject has an independent lifecycle; multiple subjects may be active, with one primary focus. New hierarchy edits allow only a parent and one child level within the same subject.

Mastery uses four integer dimensions: understanding, recall, application and interview. Zero is unassessed; 1 weak, 2 partial, 3 strong. Omitted fields preserve previous ratings; explicit zero clears one. All four strong means Interview Ready. Any weak rating, or partial recall/application/interview, means Needs Review. Otherwise the topic is Learning. This intentionally avoids asserting interview readiness from incomplete evidence. Pause/completion exclude a topic; a later assessment can regress active readiness.

Assessment scheduling is Learning +2 days, Needs Review +3, newly Interview Ready +14. An already-ready topic with a fresh strong recall/application/interview rating gets +30; re-rating understanding alone gets +14. Notes never change ratings/dates. Unassessed activities start a new topic with +2, but do not postpone an existing review. A manual date lasts until the next assessment. Queues group overdue/today/upcoming, then Needs Review/Learning/Interview Ready, then oldest date and stable ID.

**Migration:** `20260924190000_technical_learning` assigns existing topics to one “Imported learning” subject per owner. It preserves IDs, hierarchy, statuses, timestamps, notes, goal links and resources; it creates no assessments or inferred mastery. Legacy readiness is displayed as legacy until reassessed. Existing subject-like topics are not silently reinterpreted. No prior migration changes.

**Consequences:** Four scores remain visible and understandable; no weighted knowledge percentage, flashcards or question-bank entities. Notes hold interview prompts. TimeBlocks determine when; activities determine learning evidence; optional ActualSession links provide timing context without altering timers. Status transitions are captured in activities for accurate weekly counts. Lifecycle edits themselves are not a general audit log. Existing deep legacy trees remain preserved; new/reparented structures obey the two-level limit.

## ADR-008 — Job pipeline timeline, rounds and action ownership (WI-005)

**Context:** WI-001 stored one JobApplication row with a current stage, next-action instant and a single interview instant; the jobs page was read-only. The job search needs visible stage history, multiple interview rounds, preparation and a clear distinction between work I owe and waiting on a company.

**Decision:** Reuse `JobApplication`, `JobStage` and the `JOB_FOLLOW_UP`/`INTERVIEW` notification types. Add one append-only `JobActivity` timeline that also carries stage history (`fromStage`/`toStage`, with a check that a stage change really changes stage), `InterviewRound` (instant + original IANA zone, practical type/status enums) and `InterviewPrepItem` (PREP/GAP kinds, at most one reference to a LearningTopic, DsaProblem or DsaTopic). `actionOwner` (ME/COMPANY/NONE) models responsibility. Applied and next-action dates become SQL DATEs per ADR-003. Writes use the owner-row lock; history and summary change together; request IDs make retries idempotent. Duplicate company + role + URL entries require confirmation instead of being blocked.

Attention is derived, not stored: overdue follow-up, result needed, interview before end of tomorrow, due today, undated own action. Waiting duration never changes stage. Reminders: one per application per planned follow-up date; interview reminders at about 24 hours and inside a configurable short window, keyed by round + start instant + window.

**Alternatives rejected:** separate stage-history and event tables (duplicate facts); a RESCHEDULED status (a moved interview is still scheduled; history lives in the timeline); copying learning/DSA data into prep (duplicates the learning engine); drag-and-drop Kanban (grouped lists are reliable and accessible on mobile); automatic mastery changes or DSA attempts from interview notes (interviews and practice are distinct evidence).

**Migration:** `20260924230000_job_pipeline` converts legacy instants to owner-local dates, imports a legacy `interviewAt` as one scheduled round, and drops the replaced columns. Defaults are conservative and no activity rows are fabricated. No prior migration changes. The conversion is exact on UTC PostgreSQL servers (CI/production); see the README timezone note for non-UTC local servers.

**Consequences:** Timeline and rounds remain visible after closing an application. Reflections are editable; results are final. Calendar sync can key on round ID + instant later without fake external IDs. Filtering is in-memory for a single owner and needs query-level work before multi-user scale.

## ADR-009 — UTC database sessions and guarded legacy timestamp repair (WI-005.1)

**Context:** `@prisma/adapter-pg` 7.10 formats `Date` parameters as UTC wall clocks without an offset, and on read replaces the offset PostgreSQL returns with `+00:00`. In a non-UTC session every app-written `timestamptz` (including Prisma-supplied `createdAt`/`updatedAt`) is stored shifted by the session offset, yet reads back "correctly". Raw SQL, migrations and any future external sync (Google Calendar) would see the shifted instants.

**Decision:** Every connection is created through `src/lib/database.ts`, which merges `-c TimeZone=UTC` into the connection string's startup `options` (pg lets connection-string values override config fields; the last `-c` wins). This covers the app, Prisma CLI migrations, seed, scripts and tests. `src/instrumentation.ts` checks the application session at startup: a non-UTC session stops the server, and a non-UTC server default only warns until a repair is recorded. `DATE` columns stay calendar labels. Existing data is **not** changed by a migration, because UTC databases are already correct. Instead, `pnpm timestamps:audit` (read-only) and `pnpm timestamps:repair` (dry-run default; `--apply --confirm=<db>`, zone guard, advisory lock, one transaction, count and ordering checks, ledger row) handle legacy databases. The repair covers every `timestamptz` column discovered in the current schema, so it works before or after pending migrations. `MaintenanceRecord` is a small Prisma-managed ledger; its migration uses `IF NOT EXISTS` because the repair may create it first.

**Repair formula:** stored `S` = intended UTC wall clock `W` read in legacy zone `L`, so `T = (S AT TIME ZONE L) AT TIME ZONE 'UTC'`. This is exact per row across DST (verified for January/EST, July/EDT and the fall-back hour). Wall clocks in the spring-forward gap were moved forward by PostgreSQL and are indistinguishable from the following hour; they are counted and left at the later reading.

**Alternatives rejected:** a per-query `SET TIME ZONE` (scattered and unsafe with pooling); a pool `connect` hook (can race the first query); an unconditional correcting migration (it would corrupt correct UTC databases); a fixed ±4/5-hour shift (wrong across DST).

**Also:** `RoutineBlock.weekdays` loses the `DEFAULT '{}'` that WI-002 used only for backfilling. The default could never satisfy its 1–7 CHECK, and all writers supply weekdays. The schema and database now have no known drift.

**Consequences:** Stored instants are identical whatever the server zone is (tested against UTC, America/Toronto and Asia/Tokyo defaults). Legacy local databases need the one-time, operator-run repair before new writes. Transaction-mode poolers that drop startup options need a UTC database default; the startup check enforces this.

## ADR-010 — Google Calendar sync for dated TimeBlocks (WI-006)

**Context:** The owner wants CareerOS blocks on phone and desktop calendars and to adjust them there, without making Google the database or risking personal calendars.

**Decision:** Sync only dated TimeBlocks, one-to-one with events in a **dedicated app-created calendar**. Request `calendar.app.created` plus `openid email`; nothing broader. Use a server-side Authorization Code flow with offline access, consent and PKCE, and encrypt refresh tokens with AES-256-GCM using an environment key (ADR-009 keeps instants in UTC). Ownership is proven by private extended properties plus the stored calendar ID; titles never count. Change detection is a three-way fingerprint comparison (last agreed version vs CareerOS vs Google), so no mutation path needs sync hooks and "pending" is derived. Concurrency uses Google etags (`If-Match`) and a PostgreSQL lease row. Idempotent creates use client-chosen event IDs persisted before the insert, plus adoption by private property during full sync. Incremental sync uses `syncToken` with identical list parameters (showDeleted, no filters). The token advances only after a complete run; a 410 triggers a full resync. Google edits apply WI-002 dated-override semantics; routines, sessions and domain state are never changed. Both-sides changes become a durable conflict resolved by choosing one side. Push channels are optional, HTTPS-only signals validated by channel ID, resource ID and token hash, and renewed during syncs.

**Alternatives rejected:** a full `calendar` scope (unnecessary access to personal calendars); writing into the primary calendar (ambiguous ownership and dangerous deletes); a generic outbox table (fingerprints plus per-block retry fields give durable, retry-safe state with less machinery); last-writer-wins (silently loses edits); importing arbitrary events or conflicts from other calendars (needs broader scopes; deferred); syncing InterviewRound separately (two calendars for one appointment); Redis or queues (the existing cron, lease and `after()` suffice for a single owner).

**Consequences:** Google outages never block CareerOS writes. Events outside the 30/90-day window stay as they were. Revocation or key rotation requires a reconnect. The webhook route is public but carries no data and only triggers a lease-guarded sync.

## ADR-011 — Weekly review: live metrics, stored reflection (WI-007)

**Context:** The owner needs a weekly loop across schedule, DSA, learning and jobs without a BI dashboard or duplicated data.

**Decision:** Weeks are owner-local Monday–Sunday, built from the existing `weekDays` and `localInstant` helpers. Weekly facts are **derived live** by pure aggregation functions from the source tables. The only new stored data is `WeeklyReview` (unique per owner and `weekStart` DATE, with a CHECK that it is a Monday) and `WeeklyPriority` (at most five, dense ordering, optional positive target). Planned-vs-actual reuses `dayProgress` and the exported `isFocusCategory` rule. "Prepare next week" reuses `generatePlan` for seven days; it is idempotent and never calls Google. Calendar sync publishes afterwards through the existing after-response mechanism. The Sunday prompt and a new `WEEKLY_REVIEW` inbox reminder use the existing notification processor, deduplicated per owner-week.

**Amends ADR-010:** Calendar sync used to generate plans 14 days ahead. That pre-empted the explicit weekly preparation, so sync now completes only the current week (today → Sunday).

**Alternatives rejected:** snapshotting metrics into the review (copies that go stale and duplicate source facts); scores or streaks (not evidence); automatic priority scheduling (the owner decides where time goes); a second planning engine.

**Consequences:** Past weeks change if late data arrives, which the page labels. Historical text is preserved. A week's priorities appear on the following week's review as commitments.

## ADR-012 — Single-owner Google sign-in, server sessions and Web Push (WI-008)

**Status:** Accepted. Supersedes ADR-005. Amends ADR-004 (reminder delivery).

**Context:** Basic Auth sends a reusable password with every request, has no logout or expiry, and cannot be revoked per browser. Reminders reached only an open Today page. The owner wants to use CareerOS on a phone and a laptop over the internet, with reminders when the app is closed, without turning it into a multi-user product.

**Decision:**

- **Identity:** Google OpenID Connect, Authorization Code + PKCE, `state` and `nonce`, scopes `openid email` only, `prompt=select_account`. The ID token comes directly from Google's token endpoint over TLS and is validated by claims (issuer, audience, expiry, issued-at, nonce, `email_verified`) instead of fetching signing keys (OIDC Core §3.1.3.7). The single allowlisted identity is `OWNER_EMAIL`. Sign-in state lives in an AES-256-GCM encrypted 10-minute cookie keyed by `AUTH_SECRET`. The owner row is created on first sign-in only for an empty database; otherwise a mismatched email is refused, never a second workspace. Calendar consent stays separate (ADR-010).
- **Sessions:** server-side `Session` rows storing the SHA-256 of a random 256-bit token; httpOnly, SameSite=Lax, Secure-over-HTTPS cookie; 30-day absolute expiry; revocation on sign-out; the allowlist re-checked on every request.
- **Access control:** `src/proxy.ts` rejects anonymous page requests (redirect to `/login`) and API requests (401) before any data access, keeps the cron endpoints bearer-only, and sets a per-request nonce CSP. Pages and actions still resolve the owner themselves.
- **Delivery:** Web Push (VAPID, RFC 8291) as an extra channel on top of the existing `NotificationLog` inbox, run by the same cron request. Rows are pushed at most 3 times within 2 hours of being due; `sentAt` means a push service accepted it. Subscriptions are owner-scoped and revoked on 404/410 or after 5 consecutive failures. The service worker shows notifications and opens same-origin paths only; it caches nothing.
- **Operations:** fail-fast environment validation, a public status-only `/api/health`, a `JobRun` table for scheduler outcomes, in-process rate limits on public endpoints, JSON export without secrets, and `pg_dump`-based backup with scratch-database restore verification.

**Alternatives rejected:** keeping Basic Auth (no revocation, password on every request); passkeys/WebAuthn or email magic links (more machinery, and magic links need a mail provider); NextAuth/Auth.js (a large dependency for one provider and one user); JWT-only stateless sessions (no server-side revocation); verifying the ID token with Google's JWKS (unneeded for a direct TLS token response, adds a key cache); a push provider SaaS or email (another vendor with personal data); Redis for rate limits or queues (explicitly out of scope; one process suffices); offline caching in the service worker (private data at rest in the browser).

**Consequences:** No passwords are stored or transmitted. Losing access to the Google account locks the owner out, so recovery means changing `OWNER_EMAIL`/`User.email` via the database. Rate limits are per process. Push reliability depends on each platform (iOS requires a Home Screen install) and is not verified by automated browsers. Multi-user support would need tenancy, roles and per-user allowlists: a new ADR (US-026).

## ADR-013 — Heroku container hosting with portable 12-factor constraints

**Status:** Accepted (2026-09-26); the host choice is superseded by ADR-014 on 2026-10-02, the portability constraints and the `DATABASE_SSL` decision stand. Complements ADR-009 (UTC sessions) and ADR-012 (operations).

**Context:** The product is feature-frozen until it has been used for real. Hosting had to satisfy the four requirements in the [deployment guide](../engineering/deployment.md): one long-running Node.js process (`after()` background syncs, the in-process rate limiter and the connection pool assume it), managed PostgreSQL 17 with TLS, HTTPS on `usesilsila.me`, and an external clock for the two scheduler endpoints. Budget is $0 today, and moving later must not require code changes. Free tiers were reviewed on 2026-09-26: Render's free web service sleeps after 15 minutes without traffic (the every-minute reminder job would keep it awake) but its free PostgreSQL expires after 30 days; Neon's free plan caps compute at 100 CU-hours per month and suspends the project past that, which a per-minute job exceeds; Koyeb's free PostgreSQL allows 5 hours per month; Fly.io and Railway no longer have free tiers; DigitalOcean's student credit ended in August 2026; AWS's free tier became six-month credits; Oracle's Always Free VM is capable but self-managed and reclaimable when idle.

**Decision:**

- **Heroku, container stack.** Eco dyno and Postgres Essential-0 (PostgreSQL 17, 1 GB), funded by the GitHub Student Developer Pack credit for 24 months, then about $10 per month. Eco dynos sleep after 30 idle minutes; the reminder job's inbound request every minute keeps the process awake, and 1000 Eco hours per month cover a month of web time plus one-off dynos.
- **One Dockerfile is the deployment artifact.** Multi-stage, `node:24-bookworm-slim`, pinned pnpm, production dependencies only, unprivileged user. `heroku.yml` makes Heroku build that file, so production runs exactly the image rehearsed locally with `docker compose --profile app`. The same image runs on any container host or VM.
- **Portability rules that must stay true:** all configuration comes from environment variables (validated at start-up); the database is plain PostgreSQL reachable by URL; scheduling is an authenticated HTTP call from any cron; the app is a single stateless process (no local disk, no in-memory state that matters across restarts); backups are `pg_dump` custom-format files. Moving hosts is: build the image elsewhere, restore a dump, repoint DNS.
- **Database TLS is an explicit setting.** `DATABASE_SSL` (`off`, `no-verify`, `verify-full` with optional `DATABASE_SSL_CA`) is applied by one helper to the application pool, the raw start-up time-zone check, the Prisma CLI datasource and the timestamp scripts, because node-postgres now treats `sslmode=require` as full verification and Heroku injects a `DATABASE_URL` without SSL parameters. `no-verify` is Heroku's documented mode; `verify-full` is preferred whenever the provider's chain verifies.
- **The Prisma CLI and `tsx` are runtime dependencies**, so `pnpm db:deploy` and `pnpm timestamps:audit` run from the production image (`heroku run …`). Migrations remain owner-run after a backup; no release phase yet.
- **No personal data migration.** The pre-launch local database held only the example seed, so production starts empty and the first owner sign-in creates the owner. The legacy repair procedure (ADR-009) stays documented but unused.

**Alternatives rejected:** serverless or edge functions (no persistent process; per-instance rate limits; pool exhaustion); Render free plus Supabase free (works and costs nothing, but 0.1 vCPU and a second vendor with no managed backups); a self-managed VM (more capacity, but PostgreSQL, TLS, updates and backups become the owner's job before the product has proven itself); Heroku's Node buildpack instead of a Dockerfile (simpler on Heroku only, and no local production rehearsal); an automatic release-phase migration (deferred until a scheduled backup exists).

**Consequences:** Cost rises to about $10 per month after the credit, at which point usage will justify staying, moving or stopping. The dyno restarts daily and on deploy, which resets in-memory rate limits (acceptable for one owner). Backups are taken with `heroku pg:backups:capture` or `pnpm db:backup` from a workstation; Essential-0 has no point-in-time recovery. Adding a Docker daemon to CI lengthens the pipeline by a parallel job. The Dockerfile must be kept in step with new runtime files that Next.js or Prisma read at start-up.

## ADR-014 — Render and Supabase free tiers while the Heroku credit is pending

**Status:** Accepted (2026-10-02). Supersedes the host choice in ADR-013; keeps its portability rules.

**Context:** The GitHub Student Developer Pack credit that would have funded Heroku was still not granted six days after application, with no estimated date. Paying about $10 per month before the product has proven its daily value contradicts the $0 constraint, and waiting longer delays the usage phase that decides what to build next. ADR-013 chose a Dockerfile precisely so the host could change without code changes.

**Decision:**

- **Render free web service, Docker runtime, Ohio.** Built from the same `Dockerfile`, declared in `render.yaml` (health check `/api/health`, deploy only after GitHub checks pass). Render injects `PORT`; `next start` honours it. Free instances spin down after 15 idle minutes; the per-minute reminder job is inbound traffic and keeps the instance awake, consuming 744 of the 750 monthly free hours. Custom domain and managed TLS are included.
- **Supabase free project, PostgreSQL 17, Canada (Central), reached through the session pooler.** Render has no outbound IPv6 and Supabase's direct host is IPv6-only, so the IPv4 session pooler (port 5432) is the connection for the app, migrations and backups. Transaction mode (6543) is never used: it breaks prepared statements and Prisma migrations. Supabase requires TLS; `DATABASE_SSL=no-verify` initially, `verify-full` with the downloadable CA as the upgrade.
- **Migrations and backups run from a workstation.** Free instances have no shell or one-off jobs. `pnpm db:deploy` and `pnpm db:backup` (with `pg_dump` 17+) run locally against the Supabase URL; the Prisma CLI stays in the image so the Heroku path keeps working unchanged.
- **Heroku remains the documented alternative.** `heroku.yml` stays. If the credit arrives, moving is a redeploy plus restore, per ADR-013.

**Alternatives rejected:** Heroku on a personal card (recurring cost before value is proven); waiting indefinitely (blocks the usage phase); Neon instead of Supabase (its 100 CU-hour monthly cap suspends the project under a per-minute cron); keeping the instance awake with a separate pinger (the cron already provides the traffic); a `release`-style migration on container start (would run with no backup and on every spin-up).

**Consequences:** No vendor backups: the owner's weekly `pnpm db:backup` is the only copy, verified with `pnpm db:restore:verify`. A fractional CPU makes server renders slower than on a paid dyno; acceptable for one owner and a reason to move once usage justifies spend. If cron-job.org fails, the instance sleeps and the first visit waits about a minute; Settings → System status reveals it. The Supabase session pooler caps clients at the project's pool size, so `DATABASE_POOL_MAX` stays small. Supabase pauses a free project after 7 idle days; the cron prevents this, and a paused project is resumed from the dashboard without data loss.

## ADR-015 — A new routine joins the days already planned; the current week plans itself

**Status:** Accepted (2026-10-21, WI-009).

**Context:** The production acceptance pass and the UX critique both found the same trap: a newcomer adds a one-off block, which creates today's plan, then creates their first routine and finds today still empty. The only remedy was a "Generate plans" control whose vocabulary ("dated plans") meant nothing to the owner. ADR-002 protects edited days from routine edits; it never required a brand-new routine to stay off days that merely exist.

**Decision:**

- **Creating a routine adds its occurrences to already-planned days from today on.** Only slots whose start is still in the future are created; a slot that overlaps an existing block is skipped unless the owner allowed overlap; existing blocks are never edited, replaced or removed. Implemented in `saveRoutine` (`src/features/schedule/editing.ts`) through the same proposal logic that edits use, and covered by a database test.
- **Editing a routine is unchanged:** days not planned yet by default, planned days only through the previewed "Also days already planned" scope (ADR-002).
- **The current week plans itself.** Viewing Today or Plan runs `generateThroughSunday`, which fills today through Sunday idempotently. Next week is still created only by **Prepare next week**. The manual generate form and action are removed.

**Alternatives rejected:** keeping the generate control with better copy (the owner would still have to know a step exists); regenerating a day whenever a routine changes (rewrites history, contradicts ADR-002); filling only today (the week grid would show "Not planned yet" for days the owner opens next).

**Consequences:** The first routine appears on Today immediately. A routine created in the afternoon for a morning slot starts tomorrow, which the success message states ("Routine added to N planned days"). Plans for the current week are created on first view rather than on a schedule; the calendar sync job and Prepare next week keep their own generation paths.

## ADR-016 — Goals and roadmaps are a planning layer over the learning models

**Status:** Accepted (2026-10-21, WI-009). Amended by ADR-025 for problem-linked items.

**Context:** The owner prepares for technical interviews from a roadmap of concepts and questions (DSA, system design, behavioural) and wants to see what is covered and what came up in interviews. `LearningTopic` and `DsaProblem` already carry mastery, attempts and revision dates with their own rules (distinct models invariant). A roadmap item is often one of those, but just as often a question ("design a rate limiter") that belongs to neither. `Goal` existed in the schema with relations to routines, subjects, topics, sessions and priorities, but had no authoring surface.

**Decision:**

- **`Roadmap` → `RoadmapItem`** (section, kind concept/question, status not started / in progress / done, `askedInInterview` with a note, notes, URL, ordering) is owner-scoped and may point at a `LearningTopic`, `DsaProblem` or `DsaTopic` through nullable `SetNull` foreign keys, exactly like `InterviewPrepItem`.
- **The roadmap never writes to the models it points at.** Marking an item done or asked changes the item only; mastery, attempts and revision dates move only through Learn and Practice. The link is for navigation and context.
- **Goals are authored on the same page** and show live progress derived from existing data: planned and recorded minutes of goal-linked blocks and sessions in the current week, roadmap items done, topics interview-ready. Counts only; no percentage score.
- **The chain on Today** marks the last fourteen owner-local days with recorded work or a saved review. It is derived on read, stores nothing, and shows no count or streak in the interface.

**Alternatives rejected:** modelling roadmap items as learning topics (forces every interview question into a mastery model and auto-converts domains); a roadmap-level completion percentage (a score, against the voice rule); storing the chain (duplicates what sessions and reviews already record).

**Consequences:** One migration adds two tables and two enums; nothing existing changes. Deleting a goal keeps its roadmaps (goal reference cleared); deleting a roadmap removes its items. Bulk entry parses one item per line so a pasted outline becomes a roadmap in one step.

## ADR-017 — A short in-process snapshot cache, dropped on every write

**Status:** Accepted (2026-10-21, WI-010).

**Context:** Production runs one Node process in Ohio against a database in Canada Central; each statement costs about 80 ms of round trip. After the WI-010 performance pass, Today still issued about forty statements, most of them read-only snapshots (DSA, learning, jobs, goals, the chain, calendar health) that several pages share and that do not change between two page views a few seconds apart. The architecture has no Redis and no page cache by design: private pages are `no-store` and the weekly review recomputes facts live.

**Decision:**

- `src/server/memo.ts` keeps read-only snapshot promises in a module-level map keyed by owner and name, for twenty seconds. The snapshot services (`dsaSnapshot`, `learningSnapshot`, `jobSnapshot`, `jobTodaySummary`, `todaysInterviews`, `goalsOverview`, `chainDays`, `calendarOverview`, `weekReview`) are the only callers.
- **Every write drops the whole cache:** each feature's server-action helper calls `forgetAll()` after its work, `recordRun` does so after a scheduler run, and `syncCalendar` does so in a `finally`, so background syncs count too. A failed load is never cached.
- **Off under test** (`NODE_ENV=test`) so service tests stay exact; `SNAPSHOT_CACHE=off` disables it anywhere, `=on` enables it in a test.
- Page-level data (the day's blocks, sessions, the running session, notes, reminders) is never cached: Start, Stop and Complete must read fresh.

**Alternatives rejected:** Redis or another process (nothing to share with: one owner, one process); Next.js `unstable_cache` or ISR (would cache private HTML, contradicting `no-store`); longer TTLs (the twenty-second window already covers moving between pages, and the write-drop makes staleness impossible for the owner's own actions).

**Consequences:** A second page view within twenty seconds skips the snapshot statements entirely. A second process would hold its own cache, which is acceptable at twenty seconds and documented here; moving to more than one instance should revisit it. Scheduler runs clear the cache every minute, so the realistic benefit is within a single minute of navigation.

## ADR-018 — The roadmap is the tracker: items carry scope, checkpoint, references and study prompts; problems live in Practice

**Status:** Accepted (2026-10-21, WI-012). Amended by ADR-025: a problem item's status and revision follow Practice.

**Context:** The owner studies with Claude, ChatGPT, YouTube and the web, and tracked that study in two browser-local HTML "command center" trackers (per-topic scope, checkpoint, priority and references, plus copy-ready study prompts with a scenario), a technical roadmap in Markdown, a DSA pattern book and a behavioural handbook. Silsila's roadmap (ADR-016) held only a title, a kind and marks, so the trackers stayed in use beside it. The owner wants one place: pick the topic, copy the prompt, study elsewhere, come back and mark it, keep links and notes for revision.

**Decision:**

- **`RoadmapItem` gains what a topic needs to be studied:** `scope` (what to cover), `checkpoint` (what done means), `priority` (1–3, shown as P0–P2), `estimateMinutes`, `references` (curated `{label, url, kind}` list, read-only in the app), `sourceRef` (where it came from) and `slug` (unique per roadmap; the import key). `notes` stays the owner's revision space and loses its 2 000-character cap. **`Roadmap` gains `promptTemplate` and `scenarios`**, the prompt the owner copies and the situations it is copied for (start, doubt, research, questions, summary, pause, and per-roadmap extras such as review drills and bug squash). Both have built-in defaults.
- **Copy prompt renders on the client** from the template, the item and the chosen scenario, with an optional doubt or link typed in; nothing is sent anywhere. Placeholders are `{{topic}} {{section}} {{roadmap}} {{scope}} {{checkpoint}} {{priority}} {{estimate}} {{references}} {{notes}} {{scenario}} {{extra}}`.
- **Problems stay in Practice.** The DSA roadmap's problem items link to `DsaProblem` rows (created by the same import) so attempts, confidence and revision keep their own rules; the roadmap still never writes to Practice or Learn (ADR-016 holds).
- **Material enters through a two-step import, never through the repository.** `scripts/build-roadmap-bundle.ts` parses the owner's files into a JSON bundle next to them; `scripts/import-roadmap.ts` upserts it for the single owner, keyed by roadmap title, item slug, topic name and problem URL. Re-runs update what the source defines and never touch status, completion, interview marks, attempts, confidence or notes once the owner has written any. The researched curriculum (interview formats, per-company loops, behavioural frameworks and question bank, the DSA pattern order and core problems, practical tasks and drills) is public data and lives in `scripts/lib/` with its sources; the owner's rehearsal text lives only in the bundle and the database.
- **No new states.** The handbook's readiness vocabulary (introduced, can explain, can apply, independent) goes into checkpoint text; the three statuses and the interview mark stay.

**Alternatives rejected:** a separate "study material" table (one more join for every row; the item is the unit the owner marks); storing prompts per item (a template per roadmap with placeholders is what the trackers already do); generating prompts on the server (no data needs to leave the page); seeding the material through `prisma/seed.ts` (seed is example data; this is personal).

**Consequences:** One additive migration. The roadmap detail page shows a Study panel per item and filters above eight items; the overview shows sections with done/total and a Continue link; Today shows Next per goal. Export carries the new fields. The import runbook lives in operations; the bundle is reviewed by eye once and re-imported safely after a source changes.

**Addendum (same day): revision lives in the roadmap; Learn leaves the menu.** The owner asked why Learn should exist beside a roadmap that is the tracker. `RoadmapItem` gains `nextRevisionAt` (a DATE label), `revisionStage` and `lastRevisedAt`. Done schedules a revision in 7 days; Revised moves it to 14, 30 and then 60 days; Reopen clears it; the item form can type or clear the date. Today shows a "Revise today" card, each roadmap counts and filters items due, and the existing `TECHNICAL_REVIEW` reminder counts roadmap items together with Learn topics (one preference, now set from Settings; push opens Today). Learn keeps its routes, data and tests but is no longer in the navigation; roadmap items may still link to Learn topics. Removing Learn's code is a separate decision after real use.

## ADR-019 — Today is an agenda: one launcher, one list, one bounded attention queue, panels on demand

**Status:** Accepted (2026-10-22, WI-020).

**Context:** After the UAT passes, Today was a column of equal cards: a launcher, a stats row, a timeline beside a tall daily-review card, then Goals, Revise, Jobs, Reminders, Technical prep, DSA and Notes a scroll below. The owner rejected it: it did not answer "what am I working on, what is next, what needs me, what have I recorded" in one glance, and the review occupied agenda space all day. The owner wrote a specification for an agenda-first page and confirmed three choices: no progress ring, the review in a panel, the global tokens kept.

**Decision:**

- **What Today may show.** A header with the date, the day navigation, the utilities (Activity, Notes, Review day) and one factual summary line; one compact launcher with one primary action chosen in a fixed priority (running session → block covering now → next block → earlier blocks needing a decision → nothing more planned); the agenda as an open list grouped Earlier / Now / Later on today; one "Needs attention" list of at most five rows with a paged panel for the rest. Everything else lives on its own page. Adding a card to Today is not a design option any more: a new concern becomes a row in Needs attention or a new decision here.
- **Attention is a queue, not a dashboard.** Sources are the existing memoized snapshots (interviews with open prep, the jobs attention queue, Practice and roadmap revisions, due reminders, the Sunday prompt). Order is by urgency tier (prep today, overdue, due today, upcoming), then due instant, then id; a reminder merges into the row of the entity its `dedupeKey` names and keeps its id so Mark read never hides the task; Practice and roadmap items never merge; counts are the full deduplicated queue. Each source loads independently and a failed one is named; the whole list sits behind its own boundaries so the agenda never waits for it.
- **Unresolved work is visible without blame.** A past block without a decision reads "Not recorded" or "Recorded · Needs update" and offers Log time, Reschedule and More; skipped and cancelled blocks are never called missed. Skip asks for its reason only after Skip is chosen.
- **The review, the chain and notes open on demand** in one accessible side panel at a time (inert background including the navigation, focus trap, Escape, focus return, a full sheet on phones); the panel renders its content only while open. Saving the review never locks the day.
- **No ring, no score, no streak.** The summary line states minutes and counts; the chain stays a record in the Activity panel.
- **Shared components change opt-in only** (`ExecutionControls` options, `SecondaryActions.always`, the exported `DisclosureContext`, the panel-aware refresh and shortcuts), so other pages render as before.

**Alternatives rejected:** a recorded-versus-planned ring in the launcher (the owner chose the factual line; progress that "starts" on Start would be fabricated); the review as the last agenda row (it would occupy agenda space every day); per-source Suspense boundaries in the rail (the list would reflow row by row); a Today-scoped palette from the specification's colour table (two palettes in one app; the global tokens already meet the contrast targets); deleting the services behind the removed cards (Learn, Practice, Jobs and the Roadmap still use them).

**Consequences:** `src/features/today/` holds the view models and the presentation; `src/app/today/page.tsx` only loads data and composes. The old Today-only summary components are gone. Today's statements drop (no applications count, no learning or DSA snapshot for its own cards; revisions, notes and reminders load on today only). The panel primitive is reusable but lives under Today until a second page needs it.

## ADR-020 — Plan and the Weekly review share Today's block row; clock times are 24-hour

**Status:** Accepted (2026-10-23, WI-021).

**Context:** After WI-020, Today's rows, statuses and vocabulary ("Done", "Not recorded", "Recorded · Needs update", never "overdue" or "missed") existed only on Today. Plan still drew a 7-column grid of 12-hour cards from `executionLabel`, and the Weekly review had its own day lines and "Completed". The owner chose to make the other pages read like Today, one work item each, and decided that the app shows one time format and keeps counts as records without bars or ratios.

**Decision:**

- **One block row.** The resolution, its words, the title rule for a linked interview and the meta line live in `src/features/schedule/row.ts`; the row skeleton in `src/features/schedule/block-row.tsx`. Today, Plan and (from WI-024) the Weekly review render blocks through them. A page may add its own side content (Today: actions, Details, a panel; Plan: a link to Today) but never its own status words.
- **Plan is the week as days**, not a grid: one facts line, a strip of day chips, seven stacked day sections whose heading is the single link to that day on Today. Acting on a block (start, log, reschedule, skip) stays on Today; Plan links there. Routines are a panel, so the week is first on every screen.
- **24-hour time everywhere.** `hhmm` in `src/lib/time.ts` is the only clock formatter; `clock` was removed in WI-024. Dates keep `shortDate` / `weekdayDate`.
- **Counts are records.** Pages may state "12 done · 53 left"; they do not draw progress bars, ratios ("3 / 5 completed") or pace estimates.

**Alternatives rejected:** keeping the 7-column grid with Today's row inside each column (at 1440 with the sidebar a column is about 150 px, too narrow for `time | dot | title | status`); a 12-hour Today with 24-hour elsewhere (the owner wanted one format); a separate "week row" component for Plan (two row recipes to keep in step).

**Consequences:** `src/features/today/domain.ts` re-exports the moved names, so its tests are the regression contract for the shared module. Plan loads block sessions (one statement) and linked rounds when they exist. `executionLabel` and `executionTone` remain for `tests/execution-domain.test.ts` and have no page consumer after WI-021.

## ADR-021 — Version 2: deterministic moments first; AI only on minimal, previewed study text

**Status:** Accepted (2026-10-25, WI-027). The plan is `docs/product/v2-plan.md`.

**Context:** Version 1 (WI-001 to WI-026) is live and the feature freeze ends with the owner's Version 2 plan. Two earlier V2 directions were rejected or narrowed: an AI morning brief and week draft ("not exciting") and a broad set of AI study features. The owner set the constraints: calm, story-led "moments, not dashboards"; AI through OpenRouter, only on generic study text, under a US$5 monthly cap enforced in Silsila; no guilt, streaks, scores or confetti.

**Decision:**

- **Deterministic work leads.** Focus session, Study Nudges, Close the Day and the practice drills need no AI. AI is one feature (Grill Me) in Phase 3, behind a readiness gate.
- **Moments are rare and earned.** One quiet moment per real event. No confetti, counters, streaks, scores, comparisons or guilt copy. Sound is off by default; the end-of-focus chime is the owner's switch. Motion stays under `prefers-reduced-motion: no-preference`.
- **Records stay the source of truth.** Only the existing writers change data, after an explicit confirmation. Focus adds words to the session's existing notes (`Intention: …`, `Learned: …`), never a new store.
- **AI rules (from Phase 3).** One allowlist function builds every payload from minimal, length-limited fields the owner sees and can untick before sending; notes, answers, the schedule, jobs and reflections never leave. One pinned model and one pinned ZDR provider endpoint, `allow_fallbacks: false`, `data_collection: "deny"`, no `models` array; fail closed. No prompt or answer history is stored; only what the owner keeps. A ledger without content enforces the US$5 monthly cap before each call.

**Alternatives rejected:** an AI "next move" on Today and AI day or week planning (both need the owner's schedule and duplicate the deterministic launcher); AI-generated traces and disguises as the only path for the drills (correctness and drift); default-on sound.

**Consequences:** Focus is a route (`/focus`) entered from Start; the running strip and the launcher link to it. Later WIs add their own migrations (Study Nudges: settings, rest day, presence; Grill Me: usage ledger and kept cards). Each WI keeps its own handoff.

## ADR-022 — The AI provider for Grill Me (Version 2 R4)

**Status:** Accepted (2026-10-26, owner sign-off below). WI-031 builds on it.

**Context:** ADR-021 allows one pinned model on one pinned zero-data-retention (ZDR) endpoint through OpenRouter, with no fallback and a US$5 monthly cap. R4 checks what is true today before any code is written. The checks ran on 2026-10-26 against OpenRouter's public lists, which need no key and receive nothing about the owner:

- `GET https://openrouter.ai/api/v1/endpoints/zdr`
- `GET https://openrouter.ai/api/v1/models/anthropic/<model>/endpoints` for `claude-haiku-5.5`, `claude-sonnet-5.5` and `claude-opus-5.5`

**What the checks showed (2026-10-26), for Claude Haiku 5.5:**

| Endpoint (OpenRouter slug)                   | On the ZDR list | Strict structured outputs | Price per million tokens (in / out) |
| -------------------------------------------- | --------------- | ------------------------- | ----------------------------------- |
| `google-vertex/global`                       | Yes             | Yes                       | US$0.10 / US$0.50                   |
| `google-vertex/us`, `google-vertex/europe`   | Yes             | Yes                       | US$0.11 / US$0.55                   |
| `amazon-bedrock`, `/us-east-1`, `/eu-west-1` | Yes             | No (JSON mode only)       | US$0.10–0.11 / US$0.50–0.55         |
| `anthropic`, `azure/*`, `claude-on-aws`      | No              | —                         | —                                   |

- Grill Me needs a strict JSON schema, so only the Google Vertex endpoints fit both rules for this model.
- The owner asked for the cheapest model from an established company that follows every rule here, within a budget of US$2–3 a month and never more than US$5.
- The larger models have the same shape: their ZDR endpoints are Google Vertex (and Bedrock), with strict structured outputs on Vertex. The cost of one ladder assumes about 700 input tokens and at most 900 output tokens (ADR-021, plan section 8):

| Model on `google-vertex/global` (snapshot)  | Price per million (in / out) | One ladder, at most | Ladders within US$5 |
| ------------------------------------------- | ---------------------------- | ------------------- | ------------------- |
| `anthropic/claude-haiku-5.5` (`-20261007`)  | US$0.10 / US$0.50            | about US$0.0005     | about 9,600         |
| `anthropic/claude-sonnet-5.5` (`-20260928`) | US$2 / US$10                 | about US$0.010      | about 480           |
| `anthropic/claude-opus-5.5` (`-20260921`)   | US$4 / US$20                 | about US$0.021      | about 240           |

- Other makers on established hosts, also ZDR with strict structured outputs, cost more per ladder: Gemini 3.8 Flash on `google-vertex/global` about US$0.0039 (US$0.0019 on the lower-priority `flex` tier), Mistral Medium 3.1 on `mistral/zdr` about US$0.0021, GPT-5.4 on `azure` about US$0.015. Cheaper ZDR models exist on smaller hosts, often quantized (fp4/fp8); they were left out for quality and for trust in the ZDR claim.
- Every listed Vertex endpoint reported full uptime over the last 30 minutes at the time of the check. The `/us` and `/europe` regions cost about 10% more than `/global`.

**Decision:**

- **Model:** `anthropic/claude-haiku-5.5`, the cheapest model from an established company that meets every rule. One ladder costs at most about US$0.0005, so ten ladders a day come to about US$0.15 a month. If its ladders rate poorly in the owner's ten-item check (plan section 1), `anthropic/claude-sonnet-5.5` on the same endpoint family is the step up, at about US$0.010 a ladder. Changing the model is an owner decision recorded here, never an automatic switch. A blind comparison of models can come later.
- **Endpoint:** `google-vertex/global`, the cheapest region with ZDR and strict structured outputs. `google-vertex/us` is the alternative if the owner wants the US region, at about 10% more.
- **Every request** carries one `model`, no `models` array, and:

  ```json
  "provider": {
    "order": ["google-vertex/global"],
    "only": ["google-vertex/global"],
    "allow_fallbacks": false,
    "zdr": true,
    "data_collection": "deny",
    "require_parameters": true
  }
  ```

  OpenRouter accepts the full slug with its region suffix to pin one endpoint. `allow_fallbacks` defaults to true and `data_collection` to `"allow"`, so both are always set explicitly.

- **Fail closed.** A daily preflight in WI-031 repeats both checks. If the endpoint leaves the ZDR list, loses structured outputs or disappears, AI controls turn off until the owner approves again. A price change updates the ledger rates only after the owner sees it.
- **Two caps.** Silsila's own ledger stops AI at **US$3** per calendar month in the owner's timezone, checked before each call: the owner's working budget, tighter than ADR-021's US$5. The OpenRouter key gets a hard credit limit of **US$5** with `limit_reset: "monthly"` (it resets at midnight UTC), so even a fault in Silsila cannot spend more. Whichever is reached first stops the feature.
- **Account settings.** Account-level ZDR is turned on for Anthropic models and prompt logging stays off, so a request without `zdr: true` still cannot reach a retaining endpoint.

**What these controls do and do not establish:**

- **OpenRouter:** it defines ZDR as a provider that "will not store your data for any period of time". It does not count in-memory prompt caching as retention, and it does not keep prompts unless the account opts into logging.
- **Google:** Vertex AI's data governance page (last updated 2026-10-22) says Google won't train on customer data without permission. Its caching and request-logging switches belong to the Google Cloud project that sends the request, which is OpenRouter's, not Silsila's. Its abuse-monitoring note names Google models and does not address partner models such as Claude.
- **Silsila's reach:** it can enforce routing, field allowlists, caps and its own non-storage. It cannot audit OpenRouter's or Google's internals. The owner accepts that residual trust in signing off.

**Consequences (WI-031):**

- The model, endpoint, prices, token ceiling, caps and rate limits are constants in `src/features/ai/domain.ts`. The provider check (`evaluateProvider`) and the request (`requestBody`) read them, and a change to any of them is a change to this ADR first.
- **`temperature` is never sent.** The pinned endpoint does not list it among its supported parameters, and `require_parameters: true` would refuse to route such a request. The check also verifies that every parameter Silsila sends (`SENT_PARAMETERS`) is still supported.
- **Output ceiling raised to 2,000 tokens (2026-10-26).** In the first live check, both answers stopped at the 900-token ceiling, so the JSON never closed and no ladder was shown. The prompt now asks for short questions and points. A cut-off answer is retried once with a request to be brief, and the cut-off text is not sent back. One ladder now costs at most about US$0.0011 (about 640 input tokens and the 2,000-token ceiling), still about 2,800 ladders within US$3.
- **Hints on Practice problems (WI-032)** used the same model, endpoint, ledger, cap and checks, with their own schema (`HINTS_FORMAT`, 1,000 tokens) and the feature `GRILL_PROBLEM` in the ledger. **Removed in WI-038** at the owner's request (hints are to come from the assistant, Rumi); `GRILL_PROBLEM` stays in the enum for existing ledger rows.
- **Verifying the provider.** Every answer must report the provider `Google`. Anything else is counted, shown as unavailable, and blocks AI until the owner checks again.

**Sources (checked 2026-10-26):**

- https://openrouter.ai/docs/features/provider-routing
- https://openrouter.ai/docs/features/zdr
- https://openrouter.ai/docs/guides/best-practices/capping-shared-agent-keys.md
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance

**Owner sign-off:**

- 2026-10-26: the owner chose Google Vertex ZDR only, and the cheapest established option that meets every rule (`anthropic/claude-haiku-5.5` on `google-vertex/global`), with a working budget of US$2–3 a month and US$5 as the most.
- 2026-10-26: the owner turned on account-level ZDR for Anthropic models, kept prompt logging off, and set the Silsila key's credit limit to US$5, reset monthly.
- 2026-10-26: the owner read the Google Vertex and OpenRouter data terms and found them acceptable.

## ADR-023 — Listen: scripts written only from fetched, cross-checked sources

**Status:** Accepted (2026-10-26). The owner chose the grounded script and asked for official and non-official sources, cross-checked so that quality and legitimacy hold. WI-037 builds on it.

**Context:** the Version 2 plan (section 8, "Web research") deferred Listen until a grounding pipeline existed. A reference's name or URL does not prove that a script is grounded. The sources have to be fetched explicitly, and the passages actually used have to be shown. Roadmap items already carry curated references (`RoadmapItem.references`), most of them official documentation.

**Decision:**

- **Only on the owner's press.** The panel first shows the item fields to be sent and the sources to be fetched. Nothing is fetched until Fetch sources and write is pressed.
- **Only listed sites.** The server fetches only the item's own reference links, over HTTPS, on two lists in `src/features/listen/domain.ts`:
  - **Official:** documentation and specifications, such as PostgreSQL, MDN, OWASP, the RFCs and Kubernetes.
  - **Secondary:** vetted interview guides, engineering blogs and reference projects, such as Hello Interview, interviewing.io, GitHub and Martin Fowler.
  - User-generated and video sites (YouTube, Reddit, Glassdoor, job boards, Medium) are never fetched.
  - At most four sources, official first. Redirects are followed by hand, only to listed sites and at most three. The page must be HTML or plain text, with 8 seconds and 1.5 MB at most.
- **Passages, not pages.** Each page is reduced to readable paragraphs (no navigation, scripts or code blocks). The paragraphs sharing the most content words with the item are kept: at most three a page and nine in all, each clipped at a sentence to 600 characters.
- **One pinned request** through the ADR-022 engine (`ask()`), with the same endpoint, ledger, US$3 stop, rate limits and provider check. It sends the item's title, scope and done-when, plus the passages. The owner's note and "asked at" are never sent. The prompt allows only facts stated in the passages, and every line must cite the passage ids it relies on.
- **The cross-check** (`crossCheck`) is deterministic and runs on the server:
  - A cited passage counts only if it exists and shares at least two, and 40%, of the line's content words (`supports`).
  - A line is kept when an official passage supports it, or when supported passages come from two different sites.
  - A line backed by a single non-official site, a line no passage supports, and anything that reads as code or a link are dropped. The panel says how many were dropped and why.
  - Fewer than four checked lines means nothing is shown.
- **Shown with its evidence.** Each line carries chips for its passages. The passages used are listed with their tier, link, site and fetch time.
- **The device's own voice.** The script is read by the browser's speech synthesis, line by line, with Play, Pause, Stop, a voice and a speed. No audio is generated or stored.
- **Nothing is stored.** The script exists only in the page. The ledger row (`AiFeature.LISTEN_ITEM`) holds no content. Logs carry counts only: sources fetched or failed, passages, lines kept and dropped by reason.

**Consequences:** a line is only as good as its passages. The check tests that a passage states a line's words, not that the line is a correct reading of it. Showing every passage beside its line is how the owner judges the rest. The plan's test still applies: the owner rates five scripts useful before relying on Listen. Adding a site to a list is a reviewed code change.

## ADR-024 — Rumi, the assistant: what it reads, writes and sends

**Status:** Accepted (2026-10-27, owner sign-off below). WI-040 builds on it. It amends ADR-021, ADR-022 and ADR-023 for the Rumi plan (`docs/product/rumi-plan.md`).

**Context:** ADR-021 kept the schedule, sessions and jobs away from any model. The owner now wants an assistant, Rumi, that reads them:

- to say what was neglected;
- to plan the next day;
- to prepare a company interview doc from the web.

The owner's decisions (2026-10-26) and the R5 spike (2026-10-27, `scripts/r5-spike.ts`, US$0.0133 in all) settle how.

**What R5 showed** (model `anthropic/claude-haiku-5.5`, endpoint `google-vertex/global`, pinned with `only`, `allow_fallbacks: false`, `zdr: true`, `data_collection: "deny"`, `require_parameters: true`; every answer came from the pinned provider):

| Check                              | Result                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tools                              | The model called `get_activity({"days": 7})` unprompted, then answered in plain text from the result. Each call cost about US$0.0001 and took under a second |
| Tools with a strict JSON format    | Accepted together; the model still chose the tool call                                                                                                       |
| Web search, `web` plugin, Exa      | Ran on the pinned endpoint, cited 3 sites (amazon.jobs, jointaro.com, codesnatch.io), US$0.0076                                                              |
| Web search, `web` plugin, Parallel | Ran, cited 2 sites (techinterview.coach, amazon.jobs), US$0.0055                                                                                             |
| Output length with search          | Both search answers hit the 600-token ceiling despite asking for two sentences                                                                               |

**Decision:**

- **Reads, only through tools** that return compact, owner-scoped summaries:
  - today and the schedule, up to 14 days;
  - recorded activity per kind and day, up to 28 days, with study block titles and roadmap items done;
  - roadmap progress, next and due items;
  - practice confidence counts and recent attempts;
  - active applications and upcoming rounds with their prep item titles.
- **Never read:** any `notes` field, check-in notes, interview reflections (`topicsAsked`, `wentWell`, `toImprove`, `outcomeNotes`), `compensationNotes`, recruiter contacts and interviewer names.
  - The job description only for a prep doc, when the owner ticks it in that doc's preview.
  - Titles of blocks outside study and job categories (work, gym, personal) are sent only as "busy hh:mm–hh:mm".
  - Roadmaps with `studyAi = false` and test-named records are left out.
- **Writes only by confirmation.**
  - A tool that would change something returns a proposal.
  - Only the owner's press on its card applies it, re-checked under the owner lock, with Undo.
  - Tool results and web pages are data, never instructions.
- **Chat requests** use a separate `chatBody`: the same model and pinning as `requestBody`, plus `tools` and `tool_choice`, and free text with no strict format. The provider check also requires `tools` on the pinned endpoint.
  - Each owner message allows at most 6 tool rounds and 20 seconds per call.
  - It sends the last 12 messages and the "Rumi knows" list.
- **Web search** (WI-042) runs through the `web` plugin with **Exa**, at most 8 searches for a doc, outside the chat loop. It has no write tools and its output ceiling is 3,000 tokens.
  - The query is built by code from the company, role and round type, and sent as the whole user message. Nothing personal is ever in it.
  - Exa and the other engines are third parties without a zero-retention promise. That is why the query stays generic, and why `/privacy` names them.
  - Sources are shown with their site and date, marked **Official** when on the company's own domain (such as amazon.jobs) and **Other** otherwise.
- **Stored, as owner records:** conversations and their messages, prep docs with their sources, and the "Rumi knows" list. All of them are deletable and in the export.
  - The ledger (`AiUsage`) keeps cost and token counts only, with new features `AGENT_CHAT` and `PREP_RESEARCH`.
- **Limits:**
  - The US$3 monthly stop and the US$5 key limit stay.
  - Agent use counts owner messages, at 30 an hour and 100 a day; existing features keep their limits.
  - Haiku stays the model for everything.

**Consequences:**

- Rumi can see the owner's study and job picture, which is the point. The zero-retention endpoint and the never-read list are the protection.
- A web search query leaves to a third party, but only as generic words.
- R5's sources ranged from official to thin. The doc therefore marks which is which instead of claiming that everything is verified.
- `/privacy`, `security.md` and CLAUDE.md change with WI-040 and WI-042.

**Owner sign-off:**

- 2026-10-27: the owner read the R5 results and these rules and signed off on ADR-024 as written.

## ADR-025 — A problem on the roadmap follows Practice

**Status:** Accepted (2026-10-27, WI-046). It amends ADR-016 and ADR-018 for roadmap items linked to a Practice problem. The UAT audit of 2026-10-27 made it a P0 (`output/Silsila-UAT-Audit.pdf`, section 5).

**Context:** The import put every DSA problem in two places: a `RoadmapItem` in DSA patterns and a `DsaProblem` in Practice, linked by `dsaProblemId`. Each kept its own state. "1. Two Sum" could be Done on the roadmap and Red in Practice, with two different revision dates. ⌘K listed both. The owner asked which one is true; the honest answer was neither.

**Decision:**

- **A roadmap item linked to a problem takes its status from Practice.** No attempt is Not started, any attempt is In progress, and Green is Done (`practiceStatus`, `src/features/roadmap/follow.ts`). `completedAt` is the first time it turned Green, and a later Yellow or Red reopens it.
- **Revision lives on the problem only.** These items carry no `nextRevisionAt` and no revision stage, so the roadmap's revision rail, Today's Revise card and the `TECHNICAL_REVIEW` reminder never show a problem twice. The problem's own spaced revision is unchanged.
- **Practice keeps the item in step.** `followPractice` runs in the same transaction as every write that can change the pair:
  - recording an attempt;
  - linking an item to a problem;
  - restoring a removed item;
  - the roadmap import.
    It writes the item only, and only when it differs. ADR-016 still holds: the roadmap never writes to Practice.
- **The roadmap no longer marks a problem item.**
  - Done, Start, Reopen and Revised are refused on the server ("This item follows Practice. Record an attempt on the problem instead.").
  - The open item's primary action is **Record an attempt**, a link to the problem.
  - Asked in interview, notes, Grill me, Listen, Edit and Remove stay.
  - The Edit form hides "Revise on".
- **Study help moves to the problem.** The problem page gains a **Study** section with the roadmap item's Copy prompt and scenarios, so one page is enough.
- **⌘K shows a problem once,** as its Practice row; the roadmap item's Open row is left out. Grill me and Listen stay when named.
- Concept items, and items linked to a learning topic or a DSA topic, keep the roadmap's own marks and its 7/14/30/60 revision.

**Alternatives rejected:**

- Deriving the status on every read. More than twenty readers count or filter by `RoadmapItem.status`: progress lines, Continue, goals, Rumi's tools, Look Back, noticed and reminders. Each would need the join.
- Letting the roadmap write confidence. That reverses ADR-016 and turns a planning mark into an attempt that never happened.
- Removing problem items from the roadmap. The roadmap's order and sections are what the owner follows.

**Consequences:**

- A Done problem item now means Green in Practice, so a roadmap's "N done" counts proof rather than a click.
- Items left stale by an earlier version catch up on the next attempt or import. Production had no progress when this shipped (WI-045), so nothing was stale there.
- Unlinking a problem keeps the item's last status; from then on the roadmap marks it again.
