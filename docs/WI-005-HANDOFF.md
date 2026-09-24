# WI-005 — Job search and interview pipeline handoff

## Delivery and supported flows

WI-005 implements US-044–052. CareerOS now tracks the active job search end to end. It supports:

- quick add with a duplicate confirmation
- editable application details (recruiter/hiring contacts, arrangement, offer and job-description notes)
- stage changes with append-only history
- next actions with **action required** vs **waiting on company**
- typed interview rounds with original-timezone display, reschedule history and results/reflections
- per-round prep checklists and weak-area links to learning/DSA
- a `/jobs` dashboard with filters, and an application detail page
- Today interview and job-search sections
- deduplicated follow-up and interview reminders

No WI-006 features are included.

## Schema and migration

- **Reused:** `JobApplication`, the `JobStage` enum (already had all 11 stages), the `JOB_FOLLOW_UP`/`INTERVIEW` notification types, `Resource`, `LearningTopic`, `DsaProblem` and `DsaTopic`.
- **JobApplication adds:** `workArrangement` (REMOTE/HYBRID/ONSITE/UNKNOWN), `employmentType`, `priority` (1–3), `hiringContact`, `compensationNotes`, `jobDescription` and `actionOwner` (ME/COMPANY/NONE).
- **JobApplication changes:** `appliedAt` and `nextActionAt` become owner-calendar `DATE`s (`appliedAt`, `nextActionDate`) per ADR-003. `interviewAt` is removed.
- **New tables:**
  - `JobActivity`: append-only timeline and stage history (`fromStage`/`toStage`, previous/new start for reschedules, note, `requestId` unique per owner).
  - `InterviewRound`: instant, optional end, IANA zone, type, status, interviewers, meeting URL, location, notes and reflection fields.
  - `InterviewPrepItem`: PREP/GAP, completion, ordering, and at most one link to a learning topic, DSA problem or DSA topic.
- **SQL checks:** priority is 1–3, an end time follows its start, a prep item has at most one link, and a stage change must actually change the stage.
- **Migration:** `20260924230000_job_pipeline`, a new file; no previous migration changed. It converts legacy instants in each owner's zone and imports a legacy `interviewAt` as a scheduled "Interview (imported)" round. It uses conservative defaults (NONE/UNKNOWN/2) and creates no activity rows.

Run `pnpm db:generate` and `pnpm db:deploy` before using this version against an existing database. Verification used disposable databases (`careeros_wi005_base` and `careeros_wi005_verify`); the personal database was not touched.

## Architecture

- **Pipeline:** `src/features/jobs/{domain,service,actions,forms,components,summary}` plus the `/jobs` and `/jobs/[id]` routes. The domain file holds only pure logic, and the service runs every write under `locked(userId)`.
- **Stage history:** a stage update and its `STAGE_CHANGED` row are written in one transaction, with an injected-failure rollback test. A reused request ID replays the original result; reusing it for another application fails. Any stage can reach any other, and leaving SAVED stamps today's applied date.
- **Interview rounds:** scheduling, rescheduling and results each add a timeline event. Rescheduling keeps one row and records the previous start. A result can also move the stage in the same transaction. Completed results are final, but reflections stay editable. A scheduled round that has passed shows as "Result needed".
- **Prep:** items reference other records rather than copying them. Link ownership is validated. Completion toggles take an explicit target state, so they are idempotent. The learning topic and DSA problem pages show read-only "Interview mentions". Nothing changes mastery, review dates or DSA attempts.
- **Follow-ups:** "Mark done" appends `FOLLOW_UP_DONE` and sets the next step in the same transaction. An edit is logged only when something actually changed. "Overdue by N days" uses owner-calendar dates.
- **Waiting vs action required:** attention is derived in a fixed order: overdue, result needed, interview before the end of tomorrow, due today, my action without a date. A waiting application enters attention only on its planned follow-up date. Silence never changes the stage.
- **Today:** a prominent "Today's interview" section links to the application, its prep and the meeting. A compact "Job search" card shows action count, follow-ups due, the next interview, the next JOB_SEARCH block and up to three attention items. TimeBlocks are never edited.
- **Notifications:** follow-ups get one reminder per application per planned date, sent after the preferred time and not repeated while overdue. Interviews get one reminder in the 24-hour window and one in the short window (60 minutes by default for new owners), keyed by round, start instant and window, so a reschedule re-arms them. Closed applications and disabled preferences are skipped. There is no prep-due reminder because prep items have no deadlines; the 24-hour reminder states how many prep items are open. Preferences live under `/jobs`. No closed-app push.
- **Seed:** new owners get fictional Amazon (Technical: two completed rounds, an upcoming System Design round with learning-linked prep, and a gap item), Shopify (waiting on company), Company X (follow-up due today) and Northwind (rejected). All URLs are example.com. The existing demo row stays; existing owners get nothing new. The seed hash now covers 20 tables.

## Validation (2026-09-24)

| Check                                         | Result                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `prisma format` / `db:generate` / `db:deploy` | Passed; clean database applies all 5 migrations. No drift beyond the pre-existing `RoutineBlock.weekdays` default.           |
| Seed twice                                    | All 20 domain tables unchanged on the second run.                                                                            |
| `pnpm lint` / `pnpm typecheck`                | Passed.                                                                                                                      |
| `pnpm test:ci`                                | 122 passed across 13 files, none skipped (95 prior + 27 WI-005).                                                             |
| Upgrade migration                             | WI-004 → WI-005 fixture: rows preserved, Toronto/Tokyo date conversion, legacy round imported, no history.                   |
| `pnpm build`                                  | Passed; `/jobs` and `/jobs/[id]` built.                                                                                      |
| `pnpm docs:check` / `git diff --check`        | Passed.                                                                                                                      |
| Browser (headless Chromium, 1440px and 390px) | Full WI-005 acceptance plus the WI-004 learning suite passed on a fresh database; no console errors; no horizontal overflow. |

The browser acceptance run covered:

- quick add and the duplicate warning
- search, detail editing, and the job link opening in a new tab with `rel="noopener noreferrer"`
- a stage change with a note, visible in the timeline
- three rounds, one reschedule with its history, and linked plus free-text prep with a completion toggle
- a result with reflection and a stage move, and a later reflection edit
- a weak area linked to a learning topic, shown as a mention on the topic page
- an overdue follow-up in Needs attention, and the upcoming interview list
- the waiting and rejected filters
- Today's interview section and job summary
- completing a follow-up and switching to waiting, with the timeline persisting after reload
- regressions: a DSA attempt, a learning activity, and the Today, Calendar, Review and Settings pages

## Known limitations and technical debt

- Filtering and attention are computed in memory for a single owner; multi-user scale would need query-level filters and pagination.
- Reflection edits and next-action edits are not audited field by field. Timeline entries cannot be corrected or deleted.
- An interview must start and end on the same local date; the end time is optional. Timezones are free-text IANA names, validated but chosen from a suggestion list.
- The duplicate check is exact (company, role and URL); fuzzy matching is out of scope.
- Weekly metrics are week-to-date and don't compare weeks. "Logged during job-search sessions" uses the time each application was created in CareerOS.
- No Google Calendar sync, email, scraping or closed-app push. Resources on applications are displayed but can't be added from the job page.

## Security and data considerations

- Contacts, compensation notes and job-description snapshots are personal data. They stay in owner-scoped rows and are never sent externally.
- Every mutation resolves the owner on the server and checks ownership of the application, round and any linked learning/DSA record. Client-supplied user IDs are ignored.
- URLs are restricted to HTTP(S) without embedded credentials and always open with `noopener noreferrer`.
- **Pre-existing, not introduced here:** `@prisma/adapter-pg` sends instants without an offset. On a PostgreSQL server whose `TimeZone` isn't UTC, app-written `timestamptz` values are stored shifted by that offset. The app still reads them back correctly; only raw SQL sees shifted values. CI and production (UTC) are unaffected. Local Homebrew databases may be affected. See the README timezone note.

## Review before WI-006

1. Decide the timezone fix: pin the session to UTC in the adapter configuration, and write a tested one-time correction for existing non-UTC local datasets. The correction has to happen at the same time as the pin.
2. Before migrating a personal database, confirm its server `TimeZone`. Existing job rows there are seed rows at noon, so the date conversion is safe either way.
3. Complete the reviewer's own manual browser pass, plus a formal accessibility audit and Safari/Firefox checks.
4. Resolve the `RoutineBlock.weekdays` default drift from WI-002 in its own migration.

## Suggested commit structure

1. `feat(jobs): add pipeline timeline, interview rounds and prep schema`: schema, migration, domain, service and their tests.
2. `feat(jobs): add job dashboards, Today sections and reminders`: routes, forms, Today/Learn/DSA integration, notifications and seed.
3. `docs: document WI-005 job pipeline architecture and verification`: README, ADR-008, US-044–052, UFD-006, DFD, NFR evidence, changelog and this handoff.
