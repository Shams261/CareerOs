# WI-024 — Weekly review: close the week

Date: 2026-10-23. Branch `feat/wi-024-review-close` from `main` `dc889c1` (WI-023). Last of the four work items that make Plan, Jobs, Roadmap and the Weekly review read like Today (ADR-019, ADR-020).

## Outcome

- **Header.** "Weekly review" with "Week of 19 – 25 October" beside it and the week navigation on the same line (previous, next, "This week"); "Details" is a quiet utility link on the right, no longer a fourth step (R-9, R-10 with the arrow keys moving weeks). One factual line: "This week · Draft · 10 planned · 1 done · 6 not recorded · 2 recorded, needs update · 23m focus" (`reviewSummaryLine`: the review's state first, zeros left out, no ratios; R-8). The stepper is 1 This week · 2 Reflect · 3 Next week.
- **Step 1, This week.** The focus bar and the seven-day chart stay. The five counters and the "Mon · 2 of 3 done · Open" lines are replaced by seven day sections, each headed by the day as the link to Today ("Thu 22", "Today" pill; R-6) with "1 of 7 done · 5 not recorded · 1 recorded, needs update" on the right (`dayHeading`), and the shared block rows underneath (`BlockRowShell` with `rowMeta`, status words only, no actions): "Done · 30 min recorded", "Not recorded · No session recorded", "Recorded · Needs update · under a minute recorded".
- **Step 2, Reflect.** Unchanged.
- **Step 3, Next week.** Interviews and follow-ups are rows ("Sat, Oct 25 · 14:00 · Prepare UAT Test – Round · Backend Engineer · 0 of 1 prep done", "Mon, Oct 27 · Send portfolio · Acme") instead of a hero block and a muted sentence; the facts, Prepare next week and the reminders preview stay.
- **Details.** "Completed" is "Done" for blocks; "Not recorded" and "Recorded, needs update" are separate counts; the category lines read "DSA: 3 done · 5 planned · 1 skipped"; the day-by-day legend says "done" and "recorded, needs update"; the muted paragraphs are status lines; the second reminder form is gone (Settings keeps it; R-12) and its query with it. Times are 24-hour.
- **Header utilities on phones.** The Jobs, Roadmap and Weekly review headers built in WI-022 and WI-023 rendered their utilities in the collapsed block without Today's More toggle, so "Reminder settings", "Goals" and "Details" were unreachable under 1100 px and Roadmap's Continue was hidden. They now use `UtilityMenu`; Roadmap's Continue stays visible beside the menu (`.today-head-actions`).
- **The `clock` alias is removed** from `src/lib/time.ts`; `hhmm` is the one clock formatter (ADR-020).

## Data

`scheduleWeek` (`src/features/review/domain.ts`) items now carry the block's category, status, times, description, skip reason, interview link and the sessions recorded against it (by `taskId`), and a `needs-update` state when a past block has sessions but no decision; `totals.needsUpdate` counts those (a subset of `unrecorded`, whose meaning is unchanged). New pure `reviewSummaryLine` and `dayHeading`. The existing fixture has no `taskId`, so its assertions hold; two cases were added.

## Changes

| Area    | Files                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changed | `src/app/review/page.tsx`, `src/features/review/domain.ts`, `src/lib/time.ts`, `src/features/notifications/service.ts`, `src/app/globals.css`, `tests/review-domain.test.ts`, `tests/time-integrity.test.ts`, docs |

No migrations, no new dependencies, no route changes. Step 1 uses the week's already-loaded blocks and sessions; Details loses the reminder-preference query.

## Verification

| Check                                           | Result                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `typecheck`, `build`, `docs:check` | Pass on a clean export of the branch                                                                                                                                         |
| `pnpm test:ci` (disposable database)            | All files pass; `tests/review-domain.test.ts` adds two cases (needs-update, the summary and day lines)                                                                       |
| `/review` at 1440                               | Screenshots 01–03: step one with the chart and the day rows, step three with the next-week rows, Details with "Done" and the separate counts; no console errors, no overflow |
| 390                                             | Screenshot 04: the header stacks, the stepper wraps, the day rows take the phone layout                                                                                      |
| Untouched                                       | Save draft / Save and continue, priorities with Undo, Complete review, Prepare next week, the Sunday prompt (`weeklyReviewOpen`)                                             |

## Limitations and follow-ups

- The four work items are done: Plan (WI-021), Jobs (WI-022), Roadmap (WI-023) and the Weekly review (WI-024) read like Today. `ProgressBar` in `src/components/progress-bar.tsx` has no consumer and can go in a clean-up.
- Next: real daily use; the owner's clean-out runbook; the `/privacy` page.
