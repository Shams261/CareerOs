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
