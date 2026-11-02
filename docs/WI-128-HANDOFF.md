# WI-128 handoff: Today as a loader

Date: 2026-11-02. The last page loader from the full audit (`output/Silsila-Full-Audit.pdf`, page 3: "pages and components querying Prisma"). No migration and no visible change.

## Before

`src/app/today/page.tsx` was 620 lines. Its components were already split out (header, launcher, agenda, attention), but the page function still held:

- eight direct database queries and five preloads;
- the generation call;
- about 150 lines of derivations: the summary, launcher state, Close the Day, the nudge's block, the goal and the week;
- the Day Print model, built twice.

## After

- **`src/features/today/page-data.ts` (server-only).** `todayPage(user, query, now)` returns one view model (`TodayView`). Nothing about how it reads changed:
  - the same `Promise.all` and the same preloads of the memoized snapshots (WI-061);
  - the plan still waits only for `generateThroughSunday`.
    It adds `nudgeBlock` (the nudge's block with today's and tomorrow's window), `closedPrint` and `livePrint` (each Day Print model built once) and `week` (This week's progress).
- **`src/features/today/sections/`** (server components taking `{ v: TodayView }`): `head.tsx` (`TodayHeader` with the cheer, the goal chip and the daily line), `goal-panel.tsx`, `rail.tsx` and `day-panels.tsx` (review or Close the day, Activity, Notes). The streamed parts keep their own `Suspense`: Calendar attention, Needs attention with its boundary, setup, nudges off, the chain.
- **`src/app/today/page.tsx`** is 121 lines.
- **The four largest pages no longer query the database themselves:** review, application, Settings and Today. Seven smaller pages still do: `calendar`, `dsa`, `dsa/[id]`, `roadmap/[id]`, `focus`, `jobs/[id]/prep/[docId]` and `learn/topics/[id]`. They are candidates for the same treatment.

## Proof

The lab data got a past day with one completed block (with its session) and one unrecorded block, so Close the day opens on it, plus a goal and a note to self. Computed styles of every element and the page text were taken at 1440 and 390 px, before and after:

- `/today`;
- yesterday (Close the day);
- tomorrow;
- an empty day in October.

Across 8 page views every element's style was identical. The only text difference was the live clock (09:51 → 09:53, the minutes between the runs); two old runs agreed exactly. The first-run card was not exercised (the lab owner has data); its branch is untouched composition.

## Gate

prettier, lint, typecheck, `test:ci` on a fresh database (149 files, 838 tests), build, `test:e2e` and `test:e2e:safari` (16 each), docs:check, `git diff --check`.
