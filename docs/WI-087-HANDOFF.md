# WI-087 handoff — text size

Date: 2026-10-30. Branch `feat/wi-087-text-size` from `main` `b49b0cd` (WI-086).

**Source.** On a 32-inch screen the owner found the app small and asked for the sizing to be tested and settled by me. Two facts: the owner's Chrome runs usesilsila.me at 50 % zoom (3,008 CSS px in a 1,512 pt window), which no setting inside the app can undo; and Silsila's own scale is a step under the web's norm (body 15 px, most meta 13 px, labels 11 px, against 16 px bodies on The Odin Project and MDN). A per-browser text size setting answers the second without touching hundreds of px rules.

**Migration:** none.

## What changed

| Part        | Where                                                                                     | What                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rule    | `src/lib/theme.ts`, `tests/theme.test.ts`                                                 | `TEXT_SIZE_COOKIE`, `TEXT_SIZES`, `resolveTextSize` (anything else is Default), `textZoom` (1 / 1.12 / 1.25), `textSizeLabel`.                                                                  |
| The cookie  | `src/server/theme.ts` (`savedTextSize`), `src/features/theme-actions.ts` (`saveTextSize`) | Read like the theme; saved by a server action with the same cookie options, then the layout revalidated.                                                                                        |
| The root    | `src/app/layout.tsx`, `globals.css`                                                       | `html[data-size]`; above 700 px `large` zooms the root to 1.12 and `larger` to 1.25, each setting `--ui-zoom`; the roadmap outline's sticky height divides `100vh` by it. A phone keeps zoom 1. |
| The setting | `src/features/settings/text-size-switch.tsx`, `src/app/settings/page.tsx`                 | Appearance → Text size: Default / Large / Larger as radios that save on choice (the theme switch's look), under Theme.                                                                          |

## Tests

- `tests/theme.test.ts`: 11 tests (resolution, zoom steps, labels).
- `e2e/journeys.spec.ts`: the Settings journey picks Large, sees `data-size="large"`, stays accessible, and puts Default back.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 121 files, 661 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys, axe clean.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright, the owner's curriculum in a disposable database)

Measured on Today, Plan, Roadmap, Jobs, Settings and an open roadmap item at 1,440 × 900 and 2,560 × 1,440 (a 32-inch screen at 100 %):

| Size    | Page title | One line of body text | Overflow on the six pages | axe (roadmap) |
| ------- | ---------- | --------------------- | ------------------------- | ------------- |
| Default | 43 px      | 25 px                 | none                      | clean         |
| Large   | 48 px      | 28 px                 | none                      | clean         |
| Larger  | 54 px      | 31 px                 | none                      | clean         |

The roadmap outline's sticky column stays inside the window at every size (777 of 900 px at Larger). A phone at Larger keeps zoom 1 and no overflow. The Settings row reads "Text size · Larger · Larger steps the whole app up on screens wider than a phone; kept for this browser" with the three-way switch.

## Production

Merge and deploy; there is no database step.
