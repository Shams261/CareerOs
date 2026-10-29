# WI-078 handoff — the plan as mocked

Date: 2026-10-29. Branch `feat/wi-078-today-match` from `main` `dec495f` (WI-077).

**Source.** The owner compared production with the V1 mockup and found it did not match. Read side by side on production (with two blocks on the day), the differences were: the plan's heading at 28 px with its count under it; a row's status and ⋯ on two lines; the 92 px time column with the rail and dot; "focused today" and "9 weeks left to your goal" with the cheer at the far right; chip titles cut at 22 characters. Chips and the fold themselves were fine; with one block on the day they do not show.

**Migration:** none.

## What changed

| Part    | Where                                                                    | What                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading | `src/features/today/agenda.tsx`, `globals.css`                           | `.agenda-head-text` puts the count beside the heading on Today (`.agenda.is-compact`): "Today's plan · 3 blocks · 2 still ahead" at 20 px.                                                  |
| Rows    | `globals.css`                                                            | In compact mode the rail and dot are hidden, the time column is 56 px and left-aligned, and `.agenda-side` is a flex row, so the status, ⋯ and › sit on one line. Section labels are 11 px. |
| Facts   | `src/features/today/header.tsx`, `src/app/today/page.tsx`, `globals.css` | "1h 10m focused", "9 weeks to your goal" (the goal's "left" dropped before "to your goal"), and the cheer 24 px after the facts instead of at the far right.                                |
| Chips   | `globals.css`                                                            | Titles show up to 32 characters before the ellipsis.                                                                                                                                        |

## Tests

No new tests: layout only; the journeys and axe cover the page.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 118 files, 635 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- **1366×700:** the facts "0 min focused · 1 of 3 blocks · Set a goal · One block done today. It counts."; the plan from y 473 to 775 (870 before); the goal piece and a folded block's chip opened their modals; axe clean.
- **390×844:** no overflow, the chips row scrolling, axe clean; no console errors.

## Production

Merge and deploy; there is no database step.
