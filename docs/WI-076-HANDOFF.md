# WI-076 handoff — the band as mocked

Date: 2026-10-29. Branch `feat/wi-076-band-match` from `main` `2be67b5` (WI-075).

**Source.** The owner compared the live band with the mockup from WI-075 and found three differences: the mockup carried the date inside the band, its text sat in the tint's own dark shades (and the band stayed cream on a dark page), and it sat higher and larger without a date line above it.

**Migration:** none.

## What changed

| Part          | Where                                                                   | What                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eyebrow       | `src/features/today/daily-line-card.tsx`, `header.tsx`, `first-run.tsx` | `DailyLine` takes `dateLabel` ("Thursday · 29 October") and shows it as the band's eyebrow.                                                                                                                                                                                                                                                                 |
| Colours       | `globals.css`                                                           | The band sets `--band-bg`, `--band-ink`, `--band-ink-2` and `--band-meta` per part: cream `#faeeda` with amber text for morning and evening, teal `#e1f5ee` for the afternoon, blue `#e6f1fb` for the night, the same in both themes, as the Day Print keeps fixed colours. The greeting, quotation, clock, author, ↻ and the part's name use those shades. |
| The title row | `daily-line-card.tsx`, `globals.css`                                    | While the band shows, it marks its header `data-band="on"`, and the header's date line (`.today-date`, or the first-run eyebrow) is hidden, so the row reads "Today ‹ › … More". Switched off, the date line returns.                                                                                                                                       |

## Tests

No new tests; the band's words and clock are covered by `tests/daily-line.test.ts`, and the journeys and axe cover the page.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 117 files, 633 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- **1366×700, light and dark:** the band 1022×145 px at y 90 reading "THURSDAY · 29 OCTOBER · Good afternoon, owner. · “Whatever is worth doing at all is worth doing well.” — Lord Chesterfield · 15:40 · afternoon", teal in both themes with dark teal text; the title row "Today ‹ ›"; axe clean; no overflow; no console errors.
- **390×844:** the band 354×171 px; axe clean.

## Production

Merge and deploy; there is no database step.
