# WI-080 handoff — the rail cards open somewhere

Date: 2026-10-29. Branch `feat/wi-080-rail-links` from `main` `3d0f085` (WI-079).

**Source.** The owner clicked This week on Today and nothing happened.

**Migration:** none.

## What changed

| Part         | Where                                             | What                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This week    | `src/features/today/week-card.tsx`, `globals.css` | A corner link "Plan →" to `/calendar` (the week), labelled "Open this week on Plan". Its `::after` covers the card (`.week-card` is `position: relative`), so a click anywhere on the card follows it; hover and focus show on the card's border and outline. |
| Today so far | `src/features/day-print/live.tsx`, `globals.css`  | The same with a `PanelButton` "Activity →" that opens the Activity panel (the fourteen-day chain).                                                                                                                                                            |

## Tests

No new tests: a link and a button; the journeys and axe cover the page.

## Gate

- `pnpm typecheck` and ESLint are clean, and Prettier is clean on changed files.
- `pnpm test:ci` on a fresh disposable database: 118 files, 635 tests.
- `pnpm build` passes.
- `pnpm test:e2e` and `pnpm test:e2e:safari` each pass 7 journeys.
- `pnpm docs:check` passes, and so does `git diff --check`.

## Verification (local production build, Playwright)

- A click in the middle of This week opened `/calendar`; Enter on the focused corner link did the same; axe clean; no console errors.
- The lab's day had no session with a whole minute, so Today so far was checked on production after the deploy, where the owner's day has one.

## Production

Merge and deploy; there is no database step.
