# WI-004 — Technical learning engine handoff

## Delivery and supported flows

WI-004 implements US-036–043. `/learn` now supports custom subjects, active/paused/completed/archived states, ordering, optional goals, one primary focus, ordered topics, simple parent-child organization, lifecycle/due filters, plain-text notes and persisted safe resources. Topics provide rapid partial assessments, append-only history, manual review scheduling and visible mastery. No WI-005 features are included.

## Schema and upgrade

- Added LearningSubject and LearningActivity; reused LearningTopic, LearningStatus, Resource and ActualSession.
- LearningTopic adds required subject, description/order, four integer mastery scores, last studied/reviewed instant, next review DATE and manual marker.
- LearningActivity stores owner/topic/request ID, activity type, supplied scores, before/after status, optional minutes/notes and session reference. `(userId, requestId)` is unique; SQL checks constrain scores and duration.
- User gains optional currentSubjectId; Goal and ActualSession gain relations. TECHNICAL_REVIEW extends notification types.
- New migration: `20260924190000_technical_learning`. No previous migration was modified. Existing topics are assigned to an “Imported learning” subject per owner, preserving IDs, statuses, hierarchy, notes, goal references, timestamps and resources. No fake history or inferred scores.

Run `pnpm db:generate` and `pnpm db:deploy` before running this version against an existing database. Implementation verification used disposable `careeros_wi004`; the original personal database was not migrated.

## Mastery, readiness and review policy

Four scores: understanding, recall, application, interview. 0 = unassessed, 1 = weak, 2 = partial, 3 = strong. Blank fields preserve previous scores; explicit zero clears one.

- All four Strong → Interview Ready.
- Any Weak, or Partial recall/application/interview → Needs Review.
- Otherwise → Learning.
- Paused/Completed exclude topics; inactive subjects exclude all their topics. New assessments can regress readiness. Legacy statuses stay visible until reassessment.

Learning schedules +2 owner-calendar days, Needs Review +3, newly Interview Ready +14. An already-ready topic freshly confirmed strong in recall/application/interview schedules +30. Re-rating understanding alone schedules +14. Notes never change ratings/review dates. A first unassessed study activity starts Learning with +2; later unassessed activities do not postpone existing dates. Manual dates are marked and replaced by the next assessment. Review queue groups overdue, today, upcoming; within each, Needs Review then Learning then Interview Ready, oldest date then ID.

This is distinct from DSA's independence/confidence progression. Dates reuse existing SQL DATE and Toronto/default owner-day semantics; instants remain timestamptz.

## Integrity, session, Today and notification behavior

Activity writes use the existing owner-row lock: validate ownership, check request ID/payload, append history, update summary/readiness/review in one transaction. An identical retry returns the original; changed payload reuse fails. There are no history-edit/delete actions. Topic lifecycle edits cannot bypass assessment requirements to claim readiness or hide weak scores.

An active owned TECHNICAL/SYSTEM_DESIGN session or subject-goal-matched custom session is linked when available. Timers are optional and their timestamps are unchanged. Today displays focus, due counts, two review suggestions and the next unstarted focused-subject topic when a noncancelled appropriate category/goal block exists. It never rewrites the TimeBlock.

Weekly metrics count distinct topics studied, reviewed, and transitioned to ready from actual history. Notes do not count as study; repeat transitions count a topic once. Study minutes use overlapping actual-session intervals since owner-local Monday, including elapsed active time. Activity-reported minutes remain history context and are not double-counted.

TECHNICAL_REVIEW creates at most one preference-aware daily inbox item for due eligible topics. Zero due means none. `/learn` exposes opt-in/time controls for existing owners. New demo owners receive an enabled 18:00 preference. No closed-app push is implemented.

## Seed behavior

Only newly created seed owners receive TypeScript, Node.js, PostgreSQL and System Design subjects, 19 topics and realistic activity examples (due, overdue, upcoming, new), plus a Generics documentation resource. Existing owners receive no new learning examples. `scripts/verify-seed.ts` hashes all 17 domain tables and confirms a second seed leaves persisted rows unchanged.

## Validation commands and results (2026-09-24)

| Check                                          | Evidence / result                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec prisma format` / `pnpm db:generate` | Passed.                                                                                                                                                                                                                                   |
| `pnpm lint`                                    | Passed ESLint and Prettier.                                                                                                                                                                                                               |
| `pnpm typecheck`                               | Passed Prisma generation, route types and strict TypeScript.                                                                                                                                                                              |
| `pnpm test:ci`                                 | 94 passed, 10 files, zero skipped, real disposable PostgreSQL. Previous 75 tests retained.                                                                                                                                                |
| `pnpm build`                                   | Production webpack build and TypeScript passed; new subject/topic routes included.                                                                                                                                                        |
| Clean migration                                | All four migrations applied to fresh `careeros_wi004`.                                                                                                                                                                                    |
| Upgrade migration                              | Actual previous SQL + legacy fixtures preserve notes/status/tree/goals/resources and create no history.                                                                                                                                   |
| Seed twice                                     | All 17 tables unchanged on second run.                                                                                                                                                                                                    |
| Authenticated HTTP smoke                       | Learning/subject/topic, Today (technical summary), DSA/detail, calendar, review, jobs and settings return HTTP 200 on production preview; unauthenticated app/cron return 401; missing topic renders a data-free Next not-found response. |
| `pnpm docs:check` / `git diff --check`         | Passed; 16 Markdown files checked, no whitespace errors.                                                                                                                                                                                  |
| Browser desktop/mobile                         | Pending: Chrome and in-app browser report ERR_BLOCKED_BY_CLIENT for the local preview. No WI-004 interactive/browser success claimed.                                                                                                     |

Added 19 meaningful tests cover mastery validation/partial updates, readiness transition/regression, interval rules, queue ranking, dates/DST, Today suggestions, custom subjects/focus/ownership, hierarchy, lifecycle, immutable history, retries/concurrency, actual rollback, manual scheduling, safe resources, category/goal session linking, measured weekly events, reminder preference/deduplication and legacy migration. Database suites run sequentially because global notification processing scans all owners; parallel suites with different injected dates otherwise interfere. Existing in-test concurrency checks remain enabled.

## Browser verification remaining

Complete create/edit subject and topic, add resource/safe external opening, partial → strong → weak assessment, readiness/history/reload, due/overdue/manual date, Today suggestions, filtering, focus/archive and reminder preferences. Check 1440px desktop and 390px mobile overflow and keyboard form flow. Repeat DSA and scheduling/execution browser regressions. Automated domain/database regression tests already pass; HTTP success is not a browser usability substitute.

## Known limitations, debt and review before WI-005

- History UI displays latest 100 activities; complete history remains stored. Dashboard recent history is limited to 12. No activity correction/backdating or general lifecycle audit log.
- New hierarchy edits allow two levels. Legacy deeper trees remain preserved; restructuring must obey current constraints. Moving topics across subjects is intentionally rejected.
- Interview prompts live in notes/resources. No giant question bank, rich text, AI, flashcards, case-study engine or external integration.
- Lists/snapshots are appropriate to the current single-owner scope; pagination/query tuning and representative load tests remain future NFR work.
- Browser verification remains a release gate until local preview access works. Formal accessibility, dependency audit remediation, backup/restore, HTTPS/rate limiting and operational monitoring remain existing production-readiness gaps.
- Before WI-005: finish browser/reviewer acceptance, merge dependencies in order, choose any needed history correction/export design, and resolve production gates before handling real sensitive workloads.

## Git, review and rollback

Feature branch: `feat/wi-004-technical-learning`, based on verified WI-003 commit `73a1c52`. Existing PR #1 remains open, mergeable and CI-green; WI-004 changes are kept out of it. Review WI-004 against `feat/wi-003-dsa-revision` until PR #1 is merged, then retarget to main. Do not merge a child PR into the parent feature branch. No automatic merge was performed.

Suggested commit structure (also used for delivery):

1. `feat(learning): add subjects and transactional mastery reviews` — schema, new migration, domain/service rules and tests.
2. `feat(learning): add dashboards and daily study workflows` — actions/forms/routes, Today, reminders and seed examples.
3. `docs: document WI-004 architecture and verification` — stories, ADR/UFD/DFD, handoff, CI test-isolation rationale.

Rollback is a reviewed forward fix or revert compatible with the migrated schema. Do not drop history tables on a live dataset or assume an old checkout is compatible: old seeds cannot create required-subject topics. Use a tested isolated backup restore if schema rollback is necessary. A verified tag should be created only once outstanding browser acceptance passes; do not label this checkpoint fully verified while that gate is open.

Final diff statistics and hosted CI evidence belong in the PR to avoid creating a new code run merely to rewrite timing measurements.
