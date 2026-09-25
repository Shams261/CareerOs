# WI-007 — Weekly review and planning loop handoff

Branch `feat/wi-007-weekly-review` from `main` (WI-006 merged). No WI-008 work is included.

## What exists

`/review` is one page for an owner-local Monday–Sunday week, with previous and next navigation. It shows, in order:

1. **Execution:** block counts, planned vs actual bars, a day-by-day list, routine execution counts, a three-week focus/application line, and planned/actual time by goal.
2. **Progress:** DSA, technical learning and job-search facts, plus your interview reflections quoted as written.
3. **Carry forward** as of today.
4. **This week's priorities**, chosen in last week's review.
5. **Reflection:** five optional prompts, with Save draft or Complete; completed reviews stay editable.
6. **Priorities for next week:** at most five, with optional target, category or goal; reorderable and completable.
7. **Next week:** interviews with prep progress and linked topics, DSA/learning/job dues, the routine preview or already-generated days, and **Prepare next week**.
8. **Past reviews** and the reminder setting.

Today shows a Sunday prompt while the week is unreviewed.

## Schema (`20260927090000_weekly_review`, additive)

- `WeeklyReview`: `weekStart` DATE, unique per owner and week, with a CHECK that it's a Monday. It stores biggest win, blocker, lessons, next-week change, carry forward and `completedAt`.
- `WeeklyPriority`: belongs to a review; title, category, goal, positive target and unit, dense `ordering`, `completedAt`.
- `NotificationType` gains `WEEKLY_REVIEW`.
- `DailyCheckIn` is unchanged; the daily and weekly reviews stay separate.

## Metrics

- **Live, not snapshotted:** pure functions in `review/domain.ts` recompute from source rows on each read, and the page says so.
- **Planned vs actual:** reuses `dayProgress` over the week's instants and the exported `isFocusCategory` (not Work, Gym or Personal). Rows are grouped as DSA, Technical (Technical and System design), Job search (job search and interviews), and other categories by name. Only recorded sessions count as actual time. Variance is never judged.
- **DSA:** attempts, unique problems, new vs revision attempts (by previous confidence), Red→Yellow, Yellow→Green and drops to Red, current R/Y/G levels, overdue revisions and the current topic.
- **Learning:** activities (excluding notes), topics studied and reviewed, topics that became Interview ready, topics that went from Interview ready back to Needs review, and the current subject.
- **Jobs:**
  - applications submitted, and rounds in the week by type (recruiter, assessment, coding, system design, behavioral, final/hiring manager)
  - interviews completed, follow-ups done, offers, rejections
  - pipeline counts as of now: active, waiting on company, action required, overdue follow-ups
- **Routines:** per category, planned / completed / skipped / not recorded (Gym is one of these). Known acronyms keep their case (DSA).

## Next week and Calendar

- The preview uses `routinePreview` (pure; DST-gap times are skipped). Days that are already generated show their real blocks instead.
- **Prepare next week** calls the existing `generatePlan` for each day. Generated days are skipped, so the action is idempotent. It returns the number of days generated and blocks scheduled.
- The action queues `syncSoon` after the response. The review module never calls Google.
- **Behaviour change:** Calendar sync used to generate plans 14 days ahead, which pre-empted this explicit step. It now fills only today → Sunday (`syncGenerationDays`). ADR-011 amends ADR-010.

## Prompt and reminder

- `weeklyPromptDue`: Sunday (owner-local) and this week's review not completed.
- `weeklyReminderDue`: Sunday at or after the preferred time and not completed. It uses the key `week:<monday>`, so there is at most one reminder per week.
- The preference is on `/review`, default 18:00. New seed owners get it enabled; existing owners opt in.

## Seed

New owners only: last week's completed review, and three priorities that show as this week's commitments (one done), plus the reminder preference. Dates are relative to the seed day, like the existing seed conventions. The seed hash now covers 25 tables and is unchanged on reseed.

## Validation (2026-09-24)

| Check                                              | Result                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| format / generate / clean deploy / drift           | Passed; drift exit 0                                                                            |
| Upgrade WI-006 → WI-007                            | Passed (fixture test)                                                                           |
| Seed twice                                         | 25 tables unchanged                                                                             |
| lint / typecheck / build / docs:check / diff-check | Passed                                                                                          |
| `pnpm test:ci`                                     | 178 passed in 20 files                                                                          |
| Browser 1440px + 390px                             | Review, Calendar, jobs, learning, DSA and schedule suites passed; no console errors or overflow |

Browser acceptance fixes: priority action buttons now wrap on mobile, and the routine label shows "DSA" rather than "Dsa".

## Known limitations and debt

- Weekly facts change when late data is recorded (by design, and labelled on the page).
- The Sunday browser prompt could not be observed on a Thursday run; it is covered by domain tests.
- The review day is fixed to Sunday and the week to Monday–Sunday; neither is configurable.
- The three-week trend is text only.
- Goal rows show time only, with no progress percentages.
- "Add to day" for a priority is a link to Today, not a one-click action.
- Aggregation loads a week's rows in memory, which is fine for one owner.

## Before WI-008

- Merge this branch. Run the WI-005.1 personal-database procedure, then the WI-006 real-account checklist, then use Prepare next week on your own data.
- Decide whether the review day should be configurable.

## Suggested commits

1. `feat(review): add weekly review schema and live weekly aggregation`: migration, schema, domain, service, the focus-rule export, reminder, seed, and domain/database/upgrade tests.
2. `feat(review): add weekly review page, priorities and next-week preparation`: page, forms, actions, Today prompt, CSS, Calendar generation window.
3. `docs: document weekly operating loop`.
