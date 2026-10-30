# WI-082 handoff — a closed day on Today

Date: 2026-10-29. Branch `feat/wi-082-closed-day` from `main` `6526b48` (WI-081).

**Source.** The owner closed the day and looked at Today: a 640 px "Today is closed" card with one small ring in a large grey canvas sat above the plan, the rail was empty beside it, and the launcher read "Nothing more planned today · Edit the review from the header if something changes."

**Migration:** none.

## What changed

| Part                  | Where                                                                       | What                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The print in the rail | `src/features/day-print/print.tsx`, `src/app/today/page.tsx`, `globals.css` | `DayPrintCard rail` renders a `card day-print is-rail`: "Day print" with the session count in the head, the print SVG at the rail's width, the headline, the legend, Save the print (small) and the keep-or-remove question. Today's page renders it first in the rail once the day is reviewed, where `LivePrint` was, and no longer above the workspace. A past day (no rail) keeps the column card, now 480 px wide. |
| The launcher          | `src/features/today/launcher.tsx`, `src/app/today/page.tsx`                 | The closed state reads "Day closed · The day is closed", the day's facts from `summaryLine` as its context (`closedLine`, "1 block completed · 1 min recorded · 15 min planned"), Edit review (the review modal) on the next line and Add a block as the action.                                                                                                                                                        |
| Save the print        | `src/features/day-print/save.tsx`                                           | `small` renders the small secondary button for the rail.                                                                                                                                                                                                                                                                                                                                                                |

## Tests

No new tests: a layout and copy change; the journeys and axe cover the page.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 119 files, 637 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- A fresh day with one block, one recorded minute, closed through Close the Day at 23:49: the facts line keeps REVIEWED; the launcher reads "DAY CLOSED The day is closed 1 block completed · 1 min recorded · 15 min planned Edit review Add a block"; no `.day-print` in the column; the rail is Day print (437 px) → This week → Needs attention → Make Silsila yours → Study nudges are off; the workspace starts at 324 px; Edit review opens the "Edit review" modal; axe clean; no console errors.
- At 390 px: no overflow, axe clean, the print card under the plan with the other rail cards.

## Production

Merge and deploy; there is no database step.
