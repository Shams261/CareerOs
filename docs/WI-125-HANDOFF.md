# WI-125 handoff: the Weekly review page as a loader and steps

Date: 2026-11-02. The first page loader from the full audit (`output/Silsila-Full-Audit.pdf`, page 3: "thousand-line page functions"). No migration and no visible change.

## Before

`src/app/review/page.tsx` was 1,074 lines. The default export ran from line 140 to the end as one function. It mixed two direct database queries, the Monday rule, step parsing, view derivations and all the markup of the four steps.

## After

- **`src/features/review/page-data.ts` (server-only).** `reviewPage(user, query, now)` reads everything the page shows and returns one view model (`ReviewView`):
  - the Monday "open last week" rule;
  - the parallel loads, where each step loads only what it shows and Details loads everything;
  - the derived counts, status, week word and `href`.
    The page's own `weeklyReview` and `goal` queries live here now.
- **`src/features/review/labels.ts`** (pure): `weekLabel`, `shortWeekLabel`, `weekday`, `symbol`, `STEPS`, `Step`, `readStep`, `reviewHref`.
- **`src/features/review/steps/`** (server components, each taking `{ v: ReviewView }`): `header.tsx`, `week-step.tsx`, `reflect-step.tsx`, `plan-step.tsx`, `details-step.tsx` and `parts.tsx` (`Bar`, `Fact`, `Facts`).
  - The markup moved line for line.
  - The two `formatInTimeZone(…, 'HH:mm')` calls in Details became `hhmm`, which gives the same output.
- **`src/app/review/page.tsx`** is 26 lines: the loader, the head, the step asked for.

## Proof

Computed styles of every element plus the page's whole text were taken on 11 review URLs at 1440 and 390 px, both before and after:

- the four steps;
- last week and two weeks back;
- the plan step on this week;
- an invalid `?week=`.

That is 22 page views with **0 differences**; two runs of the old build agreed exactly.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 838 tests), build, `test:e2e` and `test:e2e:safari` (16 each; the review journey walks all three steps and closes the week), docs:check, `git diff --check`.

## Next

The same split for `src/app/jobs/[id]/page.tsx` (951 lines) and `src/app/settings/page.tsx` (703 lines).
