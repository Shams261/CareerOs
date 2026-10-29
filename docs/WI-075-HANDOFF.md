# WI-075 handoff — the Today band

Date: 2026-10-29. Branch `feat/wi-075-hero-band` from `main` `0a98973` (WI-074).

**Source.** The owner tested WI-073/074 and found the daily line too small to notice, and asked for a look at Momentum (the new-tab extension): a full-screen photo, a large clock in the middle, the greeting under it, the quotation small at the bottom. Silsila keeps its light canvas, so the proposal was Momentum's essentials at the top of Today: the greeting and a clock, large, on a tinted band.

**Owner's choices (2026-10-29):** a live clock like Momentum's; the band as mocked (about 130 px, greeting 30 px, quotation 17 px, clock 42 px); a light tint.

**Migration:** none.

## What changed

| Part      | Where                                                   | What                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The band  | `src/features/today/daily-line-card.tsx`, `globals.css` | `DailyLine` is a `section.daily-band` on a flat tint by the part of the day (`--warning-soft` morning and evening, `--tint` afternoon, `--info-soft` night): left, the greeting in `--font-display` at 30 px and the quotation at 17 px with its author and ↻; right, the clock at 42 px with the part's name under it. Switched off, the whole band is hidden. |
| The clock | `src/features/today/daily-line.ts` (`clockLabel`)       | 24-hour in the owner's zone, ticking on the shared whole second (`useSecondTick`).                                                                                                                                                                                                                                                                              |
| Placement | `src/features/today/header.tsx`, `first-run.tsx`        | Under the title row (Today · date · arrows · More) and above the cheer line and chips; the first-run header gets the same band under its title. The header's own gradient from WI-073 is gone.                                                                                                                                                                  |
| Phone     | `globals.css`                                           | Greeting 24 px, quotation 15 px, clock 30 px top right; the text spans both rows.                                                                                                                                                                                                                                                                               |
| Contrast  | `globals.css`                                           | The author, ↻ and the part's name use `--ink-2` on the tint, after axe flagged `--muted` there.                                                                                                                                                                                                                                                                 |

## Tests

- `tests/daily-line.test.ts`: `clockLabel` reads 24-hour in the owner's zone.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 117 files, 633 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- **1366×700, light:** the band 1022×117 px at y 86, greeting 30 px, clock 42 px, reading "Good afternoon, owner. “Whatever is worth doing at all is worth doing well.” — Lord Chesterfield · 15:26 · afternoon"; the clock moved 15:23 → 15:24 on the minute; no overflow; axe clean after the contrast fix; no console errors.
- **390×844:** the band 354×145 px, greeting 24 px, clock 30 px; no overflow; axe clean.
- **1366×700, dark:** the same band on the dark tokens; axe clean.

## Production

Merge and deploy; there is no database step. The owner sets their name in Settings → Appearance → Name if not already done.
