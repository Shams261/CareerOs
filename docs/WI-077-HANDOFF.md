# WI-077 handoff — a shorter Today

Date: 2026-10-29. Branch `feat/wi-077-today-compact` from `main` `eee8d1c` (WI-076).

**Source.** The owner found Today's plan a long thread that needed scrolling and asked for ideas. Eight layouts were compared as thumbnails and four as full pages; the owner chose V1: the facts as one line, the day's blocks as chips, Earlier folded, and compact rows.

**Migration:** none.

## What changed

| Part         | Where                                                                            | What                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facts line   | `src/features/today/header.tsx`, `src/app/today/page.tsx`, `globals.css`         | The three chips are one line, `.today-facts`: focused minutes (live), done of planned, and the goal as `today-fact-button` ("9 weeks left to your goal" or "Set a goal", opening the goal modal), with Reviewed and Rest day pills and the cheer line at the end (its own line on a phone). |
| Block chips  | `src/features/today/agenda.tsx`, `globals.css`                                   | `.plan-chips`: every live block of the day in time order, each a `PanelButton` to `block:<id>` with `StatusIcon`, the time and the title; shown when the day has more than one block; scrolls sideways on a phone. The current, paused or running chip is tinted.                           |
| Earlier fold | `src/features/today/domain.ts` (`earlierFold`), `earlier-fold.tsx`, `agenda.tsx` | Settled rows (done, skipped) fold under "Earlier · N done · M skipped · X recorded"; a row still needing a decision stays open under Earlier. `EarlierFold` keeps the folded rows mounted while hidden, so each block's modal exists for its chip.                                          |
| Compact rows | `globals.css`                                                                    | `.agenda.is-compact` (Today only): rows at 10 px padding, the title at 16 px and the meta inline after it ("· Until 20:45"); on a phone the meta drops under the title again. Plan keeps its rows.                                                                                          |

## Tests

- `tests/today-compact.test.ts`: `earlierFold` folds done and skipped rows with their label, keeps an undecided row open, and has no line when nothing is settled.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 118 files, 635 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- **1366×700:** the facts line read "0 min focused today · 1 of 3 blocks · Set a goal · One block done today. It counts."; the chips "00:05 Graphs: BFS practice | 17:33 WI077 later | 19:03 WI077 evening"; the fold "Earlier · 1 done" with three open rows; the goal piece opened its modal; the first chip (a folded, done block) opened its details; the fold opened one row; axe clean.
- **390×844:** no overflow, the chips row scrolling (532 of 354 px), axe clean; no console errors.

## Production

Merge and deploy; there is no database step.
