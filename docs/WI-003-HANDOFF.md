# WI-003 — DSA learning and revision handoff

## Delivered behavior

- Manage topics (create/edit/order/status) and choose one current topic. Shared catalog is retained for the single-owner product; current focus lives on User.
- Add/edit arbitrary HTTP(S) problems with platform, difficulty, topic and notes. Stored URLs open safely in a new tab. Search/filter by title, topic, confidence, difficulty and learning/revision state.
- Dashboard shows current-topic progress, unique practiced problems, due/overdue queue, current-topic new problems, recent confidence transitions and attempts in the owner-local Monday–Sunday week.
- Problem detail displays prior mistakes/notes and append-only attempt history. Independence/confidence are required; duration/mistake/note optional. Legacy aggregate attempts are identified explicitly.
- Revision policy: Red +1/reset; Yellow +3/reset; consecutive independent Green +7/+14/+30, capped at 30. Manual dates preserve stage, carry an explicit marker, and reset to algorithmic scheduling on the next attempt.
- Today includes due counts and the first three ranked problems when a non-cancelled DSA block is scheduled. It never rewrites a block or invents actual time.
- Attempts automatically link to an active owned ActualSession with category DSA. Timers are optional; block completion never changes confidence.
- Cron emits one daily owner-local DSA inbox reminder after the preferred time only if enabled and problems are due. New seed preference defaults to 07:00; existing preferences remain unchanged. No closed-app Web Push claim.

## Data and transaction architecture

Migration: `prisma/migrations/20260924130000_dsa_revision/migration.sql`.

Adds DsaAttempt, Independence enum, PAUSED learning status, User.currentDsaTopicId, DsaProblem.revisionStage and revisionManual. Converts nextRevisionAt from timestamptz to DATE using each owner's existing timezone. Existing confidence, lastAttemptedAt, attemptsCount, topic status, resources and all schedule/session data are preserved. Unknown legacy history is not fabricated; progression starts at zero. No old migration is changed.

Attempt writes acquire the existing owner-row transaction lock, validate ownership and confidence, deduplicate `(userId, requestId)`, insert history and update problem summary together. Retry payload mismatches are rejected. SQL checks constrain confidence combinations, duration and revision stage. No application action updates/deletes prior attempts. Privileged SQL is not prevented from maintenance edits.

The calendar-date label is represented by UTC midnight in Prisma's Date object but never timezone-formatted as an instant. Attempt timestamps are real instants. Manual dates are supported only after the first attempt. Overdue dates remain unchanged until explicit adjustment/attempt; intervals start from the actual attempt's local date.

## Important files and traceability

- `src/features/dsa/domain.ts`: confidence input, revision policy, queue/state/summary helpers.
- `src/features/dsa/service.ts`: owner-checked transactional mutations and reads.
- `src/features/dsa/actions.ts`, `forms.tsx`, `summary.tsx`: server actions, forms and Today integration.
- `src/app/dsa/page.tsx`, `src/app/dsa/[id]/page.tsx`: dashboard/detail UI.
- `src/features/notifications/service.ts`, `src/app/today/page.tsx`: integrations.
- `tests/dsa-domain.test.ts`, `tests/dsa-database.test.ts`, `tests/dsa-migration.test.ts`: policy, real DB and legacy upgrade verification.
- `scripts/verify-seed.ts`, `.github/workflows/quality.yml`: repeatable data and CI.
- User stories US-028–035, ADR-006, UFD-04, DFD/ER and README DSA learning model document the feature.

## Validation evidence

Local verification uses a disposable PostgreSQL database, `careeros_wi003`, never the existing owner database. Full test suite: **75 tests across 7 files**, including all prior WI-001/WI-002 tests.

Commands used:

```sh
pnpm exec prisma format
pnpm db:deploy
pnpm exec tsx scripts/verify-seed.ts
pnpm lint
pnpm typecheck
pnpm test:ci
pnpm build
pnpm docs:check
git diff --check
git diff --stat
```

Set DATABASE_URL and TEST_DATABASE_URL to the same disposable database for seed verification/integration tests. `test:ci` runs the same Vitest suite as `pnpm test` but rejects a missing database URL.

- Clean migration deployment passes. Upgrade fixture applies actual WI-001/WI-002 SQL, inserts legacy Toronto/Tokyo data, applies WI-003, and verifies local dates, count preservation and unchanged resource links.
- Seed runs twice and compares hashes of every row in all 15 domain tables. It also passes after UI-created topics/attempts, confirming existing data is preserved.
- New seed owner receives Sliding Window, four problems, Red→Yellow and Yellow→Green examples, overdue/due/upcoming/unattempted states. Existing owners receive no new DSA examples and no fabricated history.
- Browser verification uses headless Chromium at 1440px and 390px: topic/current selection, problem creation, safe external tab (intercepted fixture), RED +1 / YELLOW +3 / GREEN 7/14/30, history, manual date, reload, filter and Today summary. All existing main routes load without horizontal overflow or browser runtime errors. Existing execution/schedule browser regression is checked separately.
- Screenshots and browser scripts are temporary local artifacts under `/private/tmp/careeros-wi003-*`; they are not durable CI screenshots. Browser flow coverage is not yet part of CI.

## CI efficiency and release workflow

Baseline hosted quality job: **1m19s**, run [35995288599](https://github.com/Shams261/CareerOs/actions/runs/35995288599).

CI now pins Node-24-compatible official actions by SHA and Ubuntu 24.04, restores pnpm's content-addressable store and Next's compiler cache, generates Prisma once, and relies on the production build's TypeScript check. Standalone local typecheck/build commands stay self-contained. The seed is intentionally run twice to verify idempotency; this is validation, not redundant work. Frozen lockfile installation, lint, docs, migrations and the full database suite remain required. New commits cancel obsolete runs on the same PR; feature pushes do not also trigger a duplicate PR build. Main still builds after merge because the merged tree is a separate integration point.

Hosted WI-003 measurements are recorded after the branch's checks finish. A cache reduces reusable work; it does not guarantee every run is faster because runner startup, cache upload and network vary. Tests are never skipped on a cache hit.

Branch: `feat/wi-003-dsa-revision`. Pre-change annotated tag: `baseline/wi-002` at `d14ecd0`. Feature commits use Conventional Commit subjects separating the domain/data layer, UI/integrations, and CI/docs. The final verified feature commit receives an annotated `wi-003-verified` tag after checks; this is a development checkpoint, not a production release.

Rollback: use reviewed revert commits for changes on main, not force pushes. The baseline tag is a source reference, not a database backup. WI-003 changes the meaning/type of revision dates, so reverting app code alone against the migrated database is not a verified rollback. Prefer a forward fix; if necessary restore a pre-migration backup into an isolated database, deploy the matching baseline and explicitly account for later writes. Follow the operations runbook before any real deployment.

## Limits and next review

- Optional “Practice today” pinning omitted; new problems are selected manually from the current-topic list.
- No attempt corrections/deletion/backdating, imports/scraping, code execution, AI ranking or generic learning engine.
- Shared topic catalog is suitable only for the existing single-owner scope; multi-user ownership remains US-026. Duplicate topic names are rejected.
- Large libraries/history are not paginated; benchmark before substantially increasing scope. Weekly attempt count covers recorded history, not unknown legacy attempts.
- Reminder counts are creation-time snapshots and do not continuously update/read-clear as problems are practiced. Timezone changes preserve revision calendar labels.
- Existing dependency audit/security/backup/monitoring/accessibility release gates remain open; WI-003 does not certify production readiness.
- Before WI-004, review feature acceptance, migration/backups, PR/ruleset policy, browser-test automation and US-027 security remediation. Do not extend to a generic revision engine without a separate story/ADR.
