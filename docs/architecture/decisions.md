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
