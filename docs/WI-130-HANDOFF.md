# WI-130 handoff: component reads behind server modules

Date: 2026-11-02. It closes the audit's "pages and components querying Prisma" item. No migration and no visible change.

## What changed

After WI-129, six server components still called `db()`. Their queries moved unchanged:

| Component                                          | Now reads through                                          | Module                                 |
| -------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `calendar/panel.tsx` (Google Calendar in Settings) | `syncWindowBlocks(userId, now)`, `blockCategories(userId)` | `src/features/calendar/reads.ts` (new) |
| `today/attention.tsx` (Needs attention)            | `attentionReminders(user, now)`                            | `src/features/today/reads.ts` (new)    |
| `today/first-run.tsx`                              | `hasLearningFocus(user)`                                   | `src/features/today/reads.ts`          |
| `execution/running.tsx` (the shell's session card) | `latestSession(userId, now)`                               | `src/features/execution/page-data.ts`  |
| `jobs/summary.tsx` (Interview mentions)            | `interviewMentions(userId, topicId?, problemId?)`          | `src/features/jobs/page-data.ts`       |
| `nudges/off-card.tsx`                              | `nudgeModes(userId)`                                       | `src/features/nudges/service.ts`       |

`tests/boundaries.test.ts` now checks every `.tsx` file under `src/`, not only pages: no UI file calls `db()`.

## Proof

The lab database got a running session (the shell card shows on every page) and a prep item on a problem (Interview mentions shows on its page). Computed styles of every element were taken at 1440 and 390 px, before and after, on Today, Settings, that problem and Jobs: **0 style differences** across 8 page views. The text differed only in the live clock and the session's countdown, from the minutes between the runs.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 839 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.
