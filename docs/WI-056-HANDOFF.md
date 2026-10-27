# WI-056 handoff — Jobs funnel

Date: 2026-10-28. Branch `feat/wi-056-jobs-funnel` from `main` `ad76ec6` (WI-055). This is the fourth P2 of the UAT audit (`output/Silsila-UAT-Audit.pdf`, section 4.6: "No pipeline view of counts by stage over time ('12 applied, 3 screens, 1 onsite')"). No migration.

## What changed

**Rules** (`src/features/jobs/funnel.ts`, pure). `FUNNEL_STEPS` is Applied, Screen, Interviews, Final, Offer.

`reach(app)` gives the furthest step an application reached, from three sources:

- its stage history (`STAGE_CHANGED` `toStage`);
- its current stage;
- its rounds, cancelled ones left out. A recruiter or hiring-manager round counts as Screen, coding and the four 2025–2026 formats as Interviews, and a final round as Final.

Two rules follow from this:

- A rejection does not undo the onsite it reached.
- A saved application with an applied date counts as Applied.

`jobsFunnel(apps, today, weekOf, weeks = 6)` groups applications by the Monday of their applied date. Without an applied date, it uses the day they were added. It returns the last six weeks (newest first), all time, and how many were sent. It gives counts only, never a rate.

**Service.** `funnelSnapshot` (`src/features/jobs/service.ts`, memoized as `jobs-funnel`) makes one owner-scoped read: stage, dates, stage history and rounds. Test-named applications are left out.

**Jobs page** (`src/app/jobs/page.tsx`). The Funnel section sits under the applications and shows only once three are out. It holds a table:

- a caption for screen readers, and a row header per week ("This week", "Oct 19");
- an All time footer;
- tabular figures.

On a phone the padding and type shrink so the six columns fit at 375 px. The scroller is a focusable labelled region in case it ever scrolls.

**Accessible names fixed** (axe `label-content-name-mismatch`, WCAG 2.5.3, found by the smoke suite):

- Jobs application rows (`ApplicationRow`): the `aria-label` is removed, so the name is the visible company, next move and context.
- Roadmap overview rows: the `aria-label` is removed. It no longer matched the name-first text since WI-049.
- Today's "Mark read" on a reminder row: its name is now "Mark read: …", so it starts with the visible words.

## Tests

| File                                 | Tests | Covers                                                                                                                                                                 |
| ------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/jobs-funnel.test.ts`          | 2     | `reach` from stage, history, rounds (cancelled ignored), saved and offer; weekly cohorts and all time, with the added-on fallback                                      |
| `tests/jobs-funnel-database.test.ts` | 1     | the owner's real applications by week, from a stage change and a recruiter round, with a test record, a saved one and another owner's left out                         |
| e2e                                  | —     | the jobs journey adds two more applications and checks the funnel's All time row with axe and phone overflow; the roadmap journey now checks the overview with axe too |

## Browser check (local, `silsila_dev_empty`)

- **1440 px:** the table shows six weeks and All time; the "demo" application is left out.
- **375 px:** all six columns fit, with no overflow.

## Also fixed here: `main` was red after WI-055

The WI-055 merge (`ad76ec6`) failed CI for two reasons, both unrelated to Rumi.

**A clock bug in Study nudges.** `processStudyNudges` read when the morning and evening nudges were sent from `NotificationLog.createdAt`. That is the database's clock, not the run's `now`.

- In production the two clocks agree. In the tests they did not.
- On 2026-10-27, the real date matched the tests' fixed day. The morning nudge then looked as if it had been sent at the real time of the run, and the spacing rule held back the evening check-in. Two database tests failed: `nudges-database` and `coach-database`.
- The nudge now reads `scheduledFor`, which is the run's `now` at write time. Behaviour in production is unchanged.

**The e2e job.**

- axe ran on the Focus page before Next had streamed its `<title>`, and reported `document-title`. `accessible()` now waits for a title first.
- A retry re-ran the whole serial suite on a workspace already set up, so the first journey failed on retry. Retries are now 0, because the journeys share one workspace in order.

## Gate

Lint, typecheck and docs check (94 files) pass on an export of the working tree. `pnpm build` passes. `pnpm test:ci`: 101 files, 563 tests. `pnpm test:e2e`: 7 passed. `git diff --check` clean.
