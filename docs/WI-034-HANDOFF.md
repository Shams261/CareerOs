# WI-034: Look Back and Moments

Date: 2026-10-26. Branch `feat/wi-034-look-back` from `main` `d7a96e7` (WI-033). This is the second Version 2 Phase 4 hypothesis (`docs/product/v2-plan.md`, section 6): "a season view motivates during a long job search". The owner chose to build it now. No migration, no AI.

## Outcome

`/review/look-back` ("Your season so far") is reached from **Look back** in the Weekly review header.

**The season grid** runs Monday to Sunday, from the week of the first recorded session to the current week, at most 26 weeks (`seasonGrid`).

- Each square is a small Day Print: that day's sessions as rings in order, coloured by kind (`miniRings`, the same layout as WI-033).
- A rest day is one thin ring.
- Today is outlined, and the rest of this week is faded.
- Each past square is a link to that day on Today, with a label such as "Tue 20 Oct: 2 sessions, 1h 30m".

**Moments** are the real firsts of the season, newest first (`moments`):

- first practice session
- first problem solved on your own
- first roadmap item done
- first interview
- first final round
- first offer
- first week reviewed

Each has one quiet line, for example "Northwind Labs, hiring manager chat. Seven weeks after your first practice session." The latest shows in a card, and **All moments** opens the full list.

- Records named like test data (`isTestNamed`) never become a moment. Production still holds test records.
- There is no score, streak, counter, comparison or generated text.

**The month so far** (`monthFacts`) is a set of facts:

- "6h 55m of recorded work"
- "3 practice attempts, 2 on your own" (the second part only when it is above zero)
- "8 roadmap items done, 3 revised"
- "2 interview rounds"
- "Most time: DSA, mostly in the afternoon"

Test-named records are left out here too.

**Cost.** The page reads only on request: one season query, the earliest five candidates for each first, and the month's counts. Nothing is cached or written.

## Changes

| Area    | Files                                                                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New     | `src/features/look-back/{domain,service}.ts`, `src/features/look-back/view.tsx`, `src/app/review/look-back/page.tsx`, `tests/look-back.test.ts`, `tests/look-back-database.test.ts`, `docs/screenshots/wi-034/` |
| Changed | `src/app/review/page.tsx` (the Look back link), `src/app/globals.css`, docs                                                                                                                                     |

## Verification

| Check                                    | Result                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, build, docs, diff check | Pass, on an export of the working tree. `pnpm test:ci`: 67 files, 430 tests                                                                                                                                                 |
| Tests                                    | Domain 5: the grid, the 26-week cap, rings fitting their square, moment order and wording, month facts. Database 2: empty before the first session; test-named problems and companies never become a moment or a month fact |
| Browser, desktop light                   | The dev season showed two weeks with today outlined, the "First interview" moment, All moments · 3 and the October facts. No console errors                                                                                 |
| Browser, 390                             | One column, no overflow; All moments opens as a full-width panel                                                                                                                                                            |

## Owner steps

None. There is no migration, and the page appears after the deploy under Weekly review → Look back.
